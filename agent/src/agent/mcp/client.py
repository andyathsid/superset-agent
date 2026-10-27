from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from collections.abc import AsyncGenerator, Sequence
from contextlib import AsyncExitStack, asynccontextmanager
from typing import Literal, TypedDict

import httpx2
from fastmcp import Client as FastMCPClient
from fastmcp.client.caching import KeyValueResponseCacheStore
from fastmcp.client.group import ClientGroup
from fastmcp.client.transports import StreamableHttpTransport
from langchain.mcp import MCPAdapter
from langchain_core.tools import BaseTool
from mcp.client.caching import CacheConfig

from agent.config import McpServerConfig
from agent.mcp.transport import http_client_factory

_TOOL_CACHE_STORE = KeyValueResponseCacheStore()
_MCP_TOOL_CACHE_FALLBACK_TTL_MS = 60_000
_MCP_DISCOVERY_TIMEOUT_SECONDS = 5.0
logger = logging.getLogger(__name__)


def _tool_cache(server: McpServerConfig) -> CacheConfig:
    token = server.token.get_secret_value() if server.token else None
    identity = hashlib.sha256(
        json.dumps([server.id, server.url, token]).encode("utf-8")
    ).hexdigest()
    return CacheConfig(
        store=_TOOL_CACHE_STORE,
        partition=identity,
        target_id=f"{server.id}-mcp",
        # Use a short freshness window when the server provides no TTL.
        # An explicit modern ttlMs=0 still disables caching.
        default_ttl_ms=_MCP_TOOL_CACHE_FALLBACK_TTL_MS,
    )


@asynccontextmanager
async def create_tools(
    servers: Sequence[McpServerConfig],
) -> AsyncGenerator[list[BaseTool], None]:
    """Keep available MCP sessions open without making each server required."""
    tools: list[BaseTool] = []
    async with AsyncExitStack() as stack:
        for server in servers:
            server_stack = await stack.enter_async_context(AsyncExitStack())
            try:
                async with asyncio.timeout(_MCP_DISCOVERY_TIMEOUT_SECONDS):
                    client = FastMCPClient(
                        StreamableHttpTransport(
                            server.url,
                            auth=server.token.get_secret_value()
                            if server.token
                            else None,
                            httpx_client_factory=http_client_factory,
                        ),
                        cache=_tool_cache(server),
                    )
                    adapter = await server_stack.enter_async_context(
                        MCPAdapter(ClientGroup({server.id: client}))
                    )
                    server_tools = await adapter.list_tools(cache_mode="use")
            except Exception as error:  # noqa: BLE001 - MCP discovery is optional.
                await server_stack.aclose()
                # Connection errors can contain URLs or credentials.
                logger.warning(
                    "MCP server %s unavailable during tool discovery (%s); continuing",
                    server.id,
                    type(error).__name__,
                )
            else:
                tools.extend(server_tools)
        yield tools


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
    return http_client_factory(
        headers=headers,
        timeout=_MCP_STATUS_TIMEOUT,
        auth=auth,
        follow_redirects=follow_redirects,
    )


async def probe_mcp_server(
    server: McpServerConfig,
) -> McpServerProbe:
    """Return the current MCP availability without exposing connection details."""
    try:
        async with asyncio.timeout(_MCP_STATUS_TIMEOUT.read):
            transport = StreamableHttpTransport(
                server.url,
                auth=server.token.get_secret_value() if server.token else None,
                httpx_client_factory=_status_http_client_factory,
            )
            client = FastMCPClient(transport)
            async with client:
                tools = await client.list_tools(cache_mode="bypass")
    except Exception as error:
        return {"status": _probe_failure_status(error), "tools": []}

    return {
        "status": "connected",
        "tools": [f"{server.id}_{tool.name}" for tool in tools],
    }


def _probe_failure_status(error: Exception) -> McpProbeStatus:
    pending: list[BaseException] = [error]
    seen: set[int] = set()
    while pending:
        current = pending.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        if isinstance(current, httpx2.HTTPStatusError):
            if current.response.status_code in {401, 403}:
                return "needs-auth"
        if isinstance(current, BaseExceptionGroup):
            pending.extend(current.exceptions)
        cause = current.__cause__ or current.__context__
        if cause is not None:
            pending.append(cause)
    return "failed"
