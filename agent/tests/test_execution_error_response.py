"""Execution errors must survive host applications with custom HTTP handlers."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx2
import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

import main
from agent.config import McpServerConfig
from agent.mcp.execution import ExecutionError


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "server_id,code,status",
    [
        ("superset", "mcp_invalid_arguments", 422),
        ("superset", "mcp_timeout", 504),
        ("unknown", "mcp_tool_not_found", 404),
    ],
)
async def test_execution_errors_bypass_host_http_handler(
    monkeypatch: pytest.MonkeyPatch, server_id: str, code: str, status: int
) -> None:
    server = McpServerConfig("superset", "Superset", "https://superset.example/mcp")
    monkeypatch.setattr(
        main.AgentSettings,
        "from_env",
        lambda: SimpleNamespace(mcp_servers=lambda: (server,)),
    )
    execute = AsyncMock(
        side_effect=ExecutionError(
            "mcp_invalid_arguments" if status == 422 else "mcp_timeout"
        )
    )
    monkeypatch.setattr(main, "execute_tool", execute)
    host = FastAPI()

    @host.exception_handler(HTTPException)
    async def incompatible_handler(
        _request: Request, _error: HTTPException
    ) -> JSONResponse:
        pytest.fail(
            "MCP execution errors should not reach the host HTTPException handler"
        )

    host.include_router(main.app.router)
    async with httpx2.AsyncClient(
        transport=httpx2.ASGITransport(app=host), base_url="http://test"
    ) as client:
        response = await client.post(
            f"/mcp-servers/{server_id}/tools/execute",
            json={"tool_name": "superset_health_check"},
        )
    assert response.status_code == status
    if status == 404:
        assert response.json()["detail"] == "MCP server is not configured."
        execute.assert_not_awaited()
    else:
        assert response.json()["detail"]["code"] == code
