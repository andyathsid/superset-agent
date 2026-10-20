from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Literal, TypedDict

import httpx2
from fastmcp import Client as FastMCPClient
from fastmcp.client.caching import KeyValueResponseCacheStore
from fastmcp.client.transports import StreamableHttpTransport
from langchain.mcp import MCPAdapter
from langchain_core.tools import BaseTool
from mcp.client.caching import CacheConfig

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
