import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from agent.config import AgentSettings
from agent.mcp.catalog import CatalogError, tool_catalog_cache
from agent.mcp.client import probe_mcp_server
from agent.mcp.transport import close_shared_mcp_resources
from core.rate_limit import limiter
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from schemas.mcp import (
    McpServerStatus,
    McpServerStatusResponse,
    McpToolCatalogResponse,
)
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware


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
                checked_at=checked_at,
            )
            for server, probe in zip(servers, probes, strict=True)
        ],
    )


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


# # All auth endpoints live under /api/v1/auth (no JWT required).
# app.include_router(auth_router, prefix="/api/v1")

# # All user CRUD endpoints live under /api/v1/users (JWT required on all routes).
# app.include_router(users_router, prefix="/api/v1")

# # All model catalog endpoints live under /api/v1/models.
# app.include_router(models_router, prefix="/api/v1")
