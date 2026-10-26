from __future__ import annotations

import asyncio
import hashlib
import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from time import monotonic
from typing import Any, Literal, cast

import httpx2
from fastmcp import Client as FastMCPClient
from fastmcp.client.transports import StreamableHttpTransport
from mcp.shared.exceptions import MCPError
from mcp.types import REQUEST_TIMEOUT, CallToolResult, TextContent
from schemas.mcp import McpServerId, McpToolCatalogItem, McpToolCatalogResponse

from agent.mcp.transport import http_client_factory

## Catalog discovery and caching

CatalogErrorCode = Literal[
    "mcp_auth_failed",
    "mcp_timeout",
    "mcp_catalog_unavailable",
]

_ERROR_DETAILS: dict[CatalogErrorCode, tuple[int, str]] = {
    "mcp_auth_failed": (
        502,
        "Authentication to the MCP server failed.",
    ),
    "mcp_timeout": (
        504,
        "The MCP server did not respond in time.",
    ),
    "mcp_catalog_unavailable": (
        502,
        "The MCP tools catalog is unavailable.",
    ),
}


class CatalogError(Exception):
    def __init__(self, code: CatalogErrorCode) -> None:
        self.code = code
        self.status_code, self.message = _ERROR_DETAILS[code]
        super().__init__(self.message)


_CATEGORY_RULES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("dashboard",), "Dashboards"),
    (("chart", "explore"), "Charts"),
    (("dataset", "table", "metric", "dimension"), "Datasets"),
    (("sql", "query"), "SQL Lab"),
    (("database",), "Databases"),
    (("user", "role", "rls"), "Security & Users"),
    (("report", "alert"), "Alerts & Reports"),
    (("annotation", "tag", "theme"), "Annotations & Tags"),
    (("instance", "health", "schema", "bug"), "System"),
)


def categorize_tool(name: str) -> str:
    for keywords, category in _CATEGORY_RULES:
        if any(keyword in name for keyword in keywords):
            return category
    return "General"


def _catalog_list(payload: object) -> list[object] | None:
    if isinstance(payload, list):
        return cast(list[object], payload)

    # FastMCP can wrap non-object structured output under "result".
    if isinstance(payload, dict):
        result = payload.get("result")
        if isinstance(result, list):
            return cast(list[object], result)

    return None


def parse_search_result(result: CallToolResult) -> list[object]:
    if result.is_error:
        raise CatalogError("mcp_catalog_unavailable")

    items = _catalog_list(result.structured_content)
    if items is not None:
        return items

    for block in result.content:
        if not isinstance(block, TextContent):
            continue

        try:
            payload: object = json.loads(block.text)
        except json.JSONDecodeError:
            continue

        items = _catalog_list(payload)
        if items is not None:
            return items

    raise CatalogError("mcp_catalog_unavailable")


def _catalog_item(
    payload: object,
    source: Literal["base", "discovered"],
    *,
    server_id: McpServerId = "superset",
) -> McpToolCatalogItem:
    if not isinstance(payload, dict):
        raise CatalogError("mcp_catalog_unavailable")

    raw = cast(dict[str, Any], payload)
    name = raw.get("name")
    if not isinstance(name, str) or not name.strip():
        raise CatalogError("mcp_catalog_unavailable")

    description = raw.get("description")
    schema = raw.get("inputSchema", raw.get("input_schema"))

    return McpToolCatalogItem.model_validate(
        {
            "name": f"{server_id}_{name}",
            "raw_name": name,
            "description": "" if description is None else description,
            "category": categorize_tool(name) if server_id == "superset" else "General",
            "source": source,
            "input_schema": schema,
        }
    )


def _normalize_error(error: Exception) -> CatalogError:
    pending: list[BaseException] = [error]
    seen: set[int] = set()
    timed_out = False

    while pending:
        current = pending.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))

        if isinstance(current, httpx2.HTTPStatusError):
            if current.response.status_code in {401, 403}:
                return CatalogError("mcp_auth_failed")

        if isinstance(current, (httpx2.TimeoutException, TimeoutError)):
            timed_out = True

        if isinstance(current, MCPError):
            if current.code == REQUEST_TIMEOUT:
                timed_out = True

        if isinstance(current, BaseExceptionGroup):
            pending.extend(current.exceptions)

        cause = current.__cause__ or current.__context__
        if cause is not None:
            pending.append(cause)

    return CatalogError("mcp_timeout" if timed_out else "mcp_catalog_unavailable")


async def _discover_catalog(
    url: str,
    api_key: str | None,
    *,
    server_id: McpServerId = "superset",
) -> McpToolCatalogResponse:
    try:
        transport = StreamableHttpTransport(
            url,
            auth=api_key,
            httpx_client_factory=http_client_factory,
        )
        client = FastMCPClient(transport)

        async with client:
            base_tools = await client.list_tools(cache_mode="bypass")

            tools_by_name: dict[str, McpToolCatalogItem] = {}
            for tool in base_tools:
                item = _catalog_item(
                    tool.model_dump(mode="json", by_alias=True),
                    "base",
                    server_id=server_id,
                )
                tools_by_name.setdefault(item.raw_name, item)

            if server_id == "superset" and "search_tools" in tools_by_name:
                result = await client.call_tool_mcp(
                    "search_tools",
                    {"query": ""},
                )

                for payload in parse_search_result(result):
                    # Validate duplicates too, so malformed results fail refresh.
                    item = _catalog_item(payload, "discovered", server_id=server_id)
                    tools_by_name.setdefault(item.raw_name, item)

        # Publish metadata only after session cleanup succeeds.
        return McpToolCatalogResponse(
            server_id=server_id,
            fetched_at=datetime.now(UTC),
            tools=sorted(
                tools_by_name.values(),
                key=lambda item: item.name,
            ),
        )
    except CatalogError:
        raise
    except Exception as error:
        raise _normalize_error(error) from None


@dataclass(frozen=True)
class _CacheEntry:
    expires_at: float
    response: McpToolCatalogResponse


class ToolCatalogCache:
    def __init__(
        self,
        ttl_seconds: float = 300.0,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        self._ttl_seconds = ttl_seconds
        self._clock = clock
        self._entries: dict[tuple[McpServerId, str, str], _CacheEntry] = {}
        self._locks: dict[tuple[McpServerId, str, str], asyncio.Lock] = {}

    def _cached(
        self,
        key: tuple[McpServerId, str, str],
    ) -> McpToolCatalogResponse | None:
        entry = self._entries.get(key)
        if entry is None or self._clock() >= entry.expires_at:
            return None

        return entry.response.model_copy(deep=True)

    async def get(
        self,
        url: str,
        api_key: str | None,
        *,
        server_id: McpServerId = "superset",
    ) -> McpToolCatalogResponse:
        credential_hash = hashlib.sha256(
            json.dumps(api_key).encode("utf-8")
        ).hexdigest()
        key = (server_id, url, credential_hash)

        cached = self._cached(key)
        if cached is not None:
            return cached

        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            cached = self._cached(key)
            if cached is not None:
                return cached

            response = await _discover_catalog(url, api_key, server_id=server_id)

            self._entries[key] = _CacheEntry(
                expires_at=self._clock() + self._ttl_seconds,
                response=response.model_copy(deep=True),
            )
            return response


tool_catalog_cache = ToolCatalogCache()
