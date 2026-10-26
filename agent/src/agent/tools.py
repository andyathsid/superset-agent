from __future__ import annotations

import asyncio
import hashlib
import json
from collections.abc import AsyncGenerator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from time import monotonic
from typing import Any, Literal, TypedDict, cast

import httpx2
from fastmcp import Client as FastMCPClient
from fastmcp.client.caching import KeyValueResponseCacheStore
from fastmcp.client.transports import StreamableHttpTransport
from langchain.mcp import MCPAdapter
from langchain_core.tools import BaseTool
from mcp.client.caching import CacheConfig
from mcp.shared.exceptions import MCPError
from mcp.types import REQUEST_TIMEOUT, CallToolResult, TextContent
from schemas.mcp import McpToolCatalogItem, McpToolCatalogResponse

_HTTP_POOL = httpx2.AsyncHTTPTransport(
    http2=True,
    limits=httpx2.Limits(
        max_connections=100,
        max_keepalive_connections=20,
        keepalive_expiry=30,
    ),
)


class _SharedPool(httpx2.AsyncBaseTransport):
    """Let run-scoped clients borrow the process-wide connection pool."""

    async def handle_async_request(self, request: httpx2.Request) -> httpx2.Response:
        """Delegate requests without transferring ownership of the pool."""
        return await _HTTP_POOL.handle_async_request(request)

    async def aclose(self) -> None:
        """Leave closing the shared pool to the Aegra application lifespan."""


def _http_client_factory(
    headers: dict[str, str] | None = None,
    timeout: httpx2.Timeout | None = None,
    auth: httpx2.Auth | None = None,
    follow_redirects: bool = False,
) -> httpx2.AsyncClient:
    """Create a run-scoped client that borrows the worker-wide pool."""
    if timeout is None:
        timeout = httpx2.Timeout(30.0, read=300.0)

    return httpx2.AsyncClient(
        auth=auth,
        headers=headers,
        timeout=timeout,
        follow_redirects=follow_redirects,
        transport=_SharedPool(),
    )


_TOOL_CACHE = CacheConfig(
    store=KeyValueResponseCacheStore(),
    partition="superset-service",
    target_id="superset-mcp",
)


@asynccontextmanager
async def create_tools(
    superset_mcp_url: str,
    superset_mcp_api_key: str | None = None,
) -> AsyncGenerator[list[BaseTool], None]:
    """Keep a run-scoped MCP session on a shared worker HTTP pool."""
    transport = StreamableHttpTransport(
        superset_mcp_url,
        auth=superset_mcp_api_key,
        httpx_client_factory=_http_client_factory,
    )
    client = FastMCPClient(transport, cache=_TOOL_CACHE)

    async with MCPAdapter(client) as adapter:
        yield await adapter.list_tools(cache_mode="use")


McpProbeStatus = Literal["connected", "needs-auth", "failed"]


class McpServerProbe(TypedDict):
    status: McpProbeStatus
    tools: list[str]


_MCP_STATUS_TIMEOUT = httpx2.Timeout(5.0)


def _status_http_client_factory(
    headers: dict[str, str] | None = None,
    timeout: httpx2.Timeout | None = None,
    auth: httpx2.Auth | None = None,
    follow_redirects: bool = False,
) -> httpx2.AsyncClient:
    """Create a short-lived client for MCP status probes."""
    return _http_client_factory(
        headers=headers,
        timeout=_MCP_STATUS_TIMEOUT,
        auth=auth,
        follow_redirects=follow_redirects,
    )


async def probe_mcp_server(
    superset_mcp_url: str,
    superset_mcp_api_key: str | None = None,
) -> McpServerProbe:
    """Return the current MCP availability without exposing connection details."""
    transport = StreamableHttpTransport(
        superset_mcp_url,
        auth=superset_mcp_api_key,
        httpx_client_factory=_status_http_client_factory,
    )

    client = FastMCPClient(transport, cache=_TOOL_CACHE)

    try:
        async with MCPAdapter(client) as adapter:
            tools = await adapter.list_tools(cache_mode="refresh")
    except httpx2.HTTPStatusError as error:
        if error.response.status_code in {401, 403}:
            return {"status": "needs-auth", "tools": []}
        return {"status": "failed", "tools": []}
    except httpx2.RequestError:
        return {"status": "failed", "tools": []}
    # except Exception:
    #     return {"status": "failed", "tools": []}

    return {
        "status": "connected",
        "tools": [tool.name for tool in tools],
    }


async def close_shared_mcp_resources() -> None:
    """Close the worker-wide HTTP pool during Aegra shutdown."""
    await _HTTP_POOL.aclose()


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
            "name": name,
            "description": "" if description is None else description,
            "category": categorize_tool(name),
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
) -> McpToolCatalogResponse:
    try:
        transport = StreamableHttpTransport(
            url,
            auth=api_key,
            httpx_client_factory=_http_client_factory,
        )
        client = FastMCPClient(transport)

        async with client:
            base_tools = await client.list_tools(cache_mode="bypass")

            tools_by_name: dict[str, McpToolCatalogItem] = {}
            for tool in base_tools:
                item = _catalog_item(
                    tool.model_dump(mode="json", by_alias=True),
                    "base",
                )
                tools_by_name.setdefault(item.name, item)

            if "search_tools" in tools_by_name:
                result = await client.call_tool_mcp(
                    "search_tools",
                    {"query": ""},
                )

                for payload in parse_search_result(result):
                    # Validate duplicates too, so malformed results fail refresh.
                    item = _catalog_item(payload, "discovered")
                    tools_by_name.setdefault(item.name, item)

        # Publish metadata only after session cleanup succeeds.
        return McpToolCatalogResponse(
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
        self._entries: dict[tuple[str, str], _CacheEntry] = {}
        self._locks: dict[tuple[str, str], asyncio.Lock] = {}

    def _cached(
        self,
        key: tuple[str, str],
    ) -> McpToolCatalogResponse | None:
        entry = self._entries.get(key)
        if entry is None or self._clock() >= entry.expires_at:
            return None

        return entry.response.model_copy(deep=True)

    async def get(
        self,
        url: str,
        api_key: str | None,
    ) -> McpToolCatalogResponse:
        credential_hash = hashlib.sha256(
            json.dumps(api_key).encode("utf-8")
        ).hexdigest()
        key = (url, credential_hash)

        cached = self._cached(key)
        if cached is not None:
            return cached

        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            cached = self._cached(key)
            if cached is not None:
                return cached

            response = await _discover_catalog(url, api_key)

            self._entries[key] = _CacheEntry(
                expires_at=self._clock() + self._ttl_seconds,
                response=response.model_copy(deep=True),
            )
            return response


tool_catalog_cache = ToolCatalogCache()
