from __future__ import annotations

import asyncio
import hashlib
import json
from collections.abc import AsyncGenerator, Sequence
from contextlib import asynccontextmanager
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


def _tool_cache(server: McpServerConfig) -> CacheConfig:
    token = server.token.get_secret_value() if server.token else None
    identity = hashlib.sha256(
        json.dumps([server.id, server.url, token]).encode("utf-8")
    ).hexdigest()
    return CacheConfig(
        store=_TOOL_CACHE_STORE,
        partition=identity,
        target_id=f"{server.id}-mcp",
    )


@asynccontextmanager
async def create_tools(
    servers: Sequence[McpServerConfig],
) -> AsyncGenerator[list[BaseTool], None]:
    """Keep run-scoped MCP sessions on a shared worker HTTP pool."""
    clients = {
        server.id: FastMCPClient(
            StreamableHttpTransport(
                server.url,
                auth=server.token.get_secret_value() if server.token else None,
                httpx_client_factory=http_client_factory,
            ),
            cache=_tool_cache(server),
        )
        for server in servers
    }
    async with MCPAdapter(ClientGroup(clients)) as adapter:
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
