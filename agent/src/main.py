import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from agent.config import AgentSettings, McpServerConfig
from agent.mcp.catalog import CatalogError, tool_catalog_cache
from agent.mcp.client import probe_mcp_server
from agent.mcp.execution import ExecutionError, execute_tool
from agent.mcp.transport import close_shared_mcp_resources
from core.rate_limit import limiter
from schemas.mcp import (
    McpServerStatus,
    McpServerStatusResponse,
    McpToolCatalogResponse,
    McpToolExecutionRequest,
    McpToolExecutionResponse,
)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    """Release worker-scoped MCP resources after Aegra stops accepting work."""
    yield
    await close_shared_mcp_resources()


app = FastAPI(lifespan=lifespan)
# Register the shared limiter so @limiter.limit(...) decorators on routes
# resolve, and install slowapi's middleware + 429 handler.
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(_request: object, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": f"Rate limit exceeded: {exc.detail}"},
    )


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "FastAPI is running!"}


@app.get("/mcp-servers/status")
async def get_mcp_server_status() -> McpServerStatusResponse:
    """Return the latest safe-to-display status for configured MCP servers."""
    settings = AgentSettings.from_env()

    servers = settings.mcp_servers()
    probes = await asyncio.gather(*(probe_mcp_server(server) for server in servers))
    tool_counts = await asyncio.gather(
        *(
            _catalog_tool_count(server, probe["status"] == "connected")
            for server, probe in zip(servers, probes, strict=True)
        )
    )

    checked_at = datetime.now(UTC)

    return McpServerStatusResponse(
        checked_at=checked_at,
        servers=[
            McpServerStatus(
                id=server.id,
                name=server.name,
                transport="HTTP",
                url=server.url,
                status=probe["status"],
                tools=probe["tools"],
                tool_count=tool_count,
                checked_at=checked_at,
            )
            for server, probe, tool_count in zip(
                servers, probes, tool_counts, strict=True
            )
        ],
    )


async def _catalog_tool_count(server: McpServerConfig, connected: bool) -> int | None:
    if not connected:
        return None

    api_key = server.token.get_secret_value() if server.token else None
    try:
        async with asyncio.timeout(5.0):
            catalog = await tool_catalog_cache.get(
                server.url,
                api_key,
                server_id=server.id,
            )
    except (CatalogError, TimeoutError):
        return None
    return len(catalog.tools)


@app.get(
    "/mcp-servers/{server_id}/tools",
    response_model=McpToolCatalogResponse,
)
async def get_tool_catalog(server_id: str) -> McpToolCatalogResponse:
    settings = AgentSettings.from_env()
    server = next(
        (server for server in settings.mcp_servers() if server.id == server_id), None
    )
    if server is None:
        raise HTTPException(status_code=404, detail="MCP server is not configured.")
    api_key = server.token.get_secret_value() if server.token else None

    try:
        return await tool_catalog_cache.get(
            server.url,
            api_key,
            server_id=server.id,
        )
    except CatalogError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail={
                "code": error.code,
                "message": error.message,
            },
        ) from None


@app.post(
    "/mcp-servers/{server_id}/tools/execute",
    response_model=McpToolExecutionResponse,
)
async def execute_mcp_tool(
    server_id: str, request: McpToolExecutionRequest
) -> McpToolExecutionResponse | JSONResponse:
    settings = AgentSettings.from_env()
    server = next(
        (item for item in settings.mcp_servers() if item.id == server_id), None
    )
    if server is None:
        return JSONResponse(
            status_code=404, content={"detail": "MCP server is not configured."}
        )
    try:
        return await execute_tool(server, request)
    except (CatalogError, ExecutionError) as error:
        # Aegra's HTTPException handler expects a string detail. Return the
        # structured MCP error directly to preserve this endpoint's contract.
        return JSONResponse(
            status_code=error.status_code,
            content={"detail": {"code": error.code, "message": error.message}},
        )


# # All auth endpoints live under /api/v1/auth (no JWT required).
# app.include_router(auth_router, prefix="/api/v1")

# # All user CRUD endpoints live under /api/v1/users (JWT required on all routes).
# app.include_router(users_router, prefix="/api/v1")

# # All model catalog endpoints live under /api/v1/models.
# app.include_router(models_router, prefix="/api/v1")
