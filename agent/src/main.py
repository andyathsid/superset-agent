from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from agent.config import AgentSettings
from agent.tools import (
    CatalogError,
    close_shared_mcp_resources,
    probe_mcp_server,
    tool_catalog_cache,
)
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

    probe = await probe_mcp_server(
        settings.superset_mcp_url,
        (
            settings.superset_mcp_api_key.get_secret_value()
            if settings.superset_mcp_api_key
            else None
        ),
    )

    checked_at = datetime.now(UTC)

    return McpServerStatusResponse(
        checked_at=checked_at,
        servers=[
            McpServerStatus(
                id="superset",
                name="Superset",
                transport="HTTP",
                url=settings.superset_mcp_url,
                status=probe["status"],
                tools=probe["tools"],
                checked_at=checked_at,
            )
        ],
    )


@app.get(
    "/mcp-servers/superset/tools",
    response_model=McpToolCatalogResponse,
)
async def get_superset_tool_catalog() -> McpToolCatalogResponse:
    settings = AgentSettings.from_env()
    api_key = (
        settings.superset_mcp_api_key.get_secret_value()
        if settings.superset_mcp_api_key
        else None
    )

    try:
        return await tool_catalog_cache.get(
            settings.superset_mcp_url,
            api_key,
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
