from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import httpx2
import pytest
from fastmcp import FastMCP
from pydantic import SecretStr

import main
from agent.config import McpServerConfig
from agent.mcp import execution
from agent.mcp.catalog import CatalogError
from schemas.mcp import (
    McpToolCatalogItem,
    McpToolCatalogResponse,
    McpToolExecutionRequest,
)


@pytest.fixture
def setup(monkeypatch: pytest.MonkeyPatch):
    server = FastMCP("execution-test")
    calls: list[tuple[str, dict]] = []

    @server.tool
    async def health_check() -> str:
        calls.append(("health_check", {}))
        return "healthy"

    @server.tool
    async def call_tool(name: str, arguments: dict) -> dict:
        calls.append((name, arguments))
        if arguments["request"]["limit"] == 99:
            raise ValueError("Sample tool error")
        return {"charts": [{"id": 1}]}

    schema = {
        "type": "object",
        "properties": {
            "request": {
                "type": "object",
                "properties": {"limit": {"type": "integer", "minimum": 1}},
                "required": ["limit"],
                "additionalProperties": False,
            }
        },
        "required": ["request"],
        "additionalProperties": False,
    }
    tools = [
        McpToolCatalogItem(
            name="superset_health_check",
            raw_name="health_check",
            description="",
            category="",
            source="base",
            input_schema={"type": "object", "additionalProperties": False},
        ),
        McpToolCatalogItem(
            name="superset_call_tool",
            raw_name="call_tool",
            description="",
            category="",
            source="base",
            input_schema={},
        ),
        McpToolCatalogItem(
            name="superset_list_charts",
            raw_name="list_charts",
            description="",
            category="",
            source="discovered",
            input_schema=schema,
        ),
    ]
    catalog = McpToolCatalogResponse(fetched_at=datetime.now(UTC), tools=tools)
    get = AsyncMock(return_value=catalog)
    monkeypatch.setattr(execution.tool_catalog_cache, "get", get)
    monkeypatch.setattr(
        execution, "StreamableHttpTransport", lambda *args, **kwargs: server
    )
    config = McpServerConfig(
        "superset", "Superset", "https://secret.example/mcp", SecretStr("secret-token")
    )
    return config, catalog, calls, get


@pytest.mark.asyncio
async def test_base_and_discovered_dispatch_preserve_results(setup) -> None:
    config, _, calls, get = setup
    base = await execution.execute_tool(
        config, McpToolExecutionRequest(tool_name="superset_health_check")
    )
    discovered = await execution.execute_tool(
        config,
        McpToolExecutionRequest(
            tool_name="superset_list_charts", arguments={"request": {"limit": 1}}
        ),
    )
    assert calls == [("health_check", {}), ("list_charts", {"request": {"limit": 1}})]
    assert base.content[0]["text"] == "healthy"
    assert not discovered.is_error
    assert discovered.structured_content == {"charts": [{"id": 1}]}
    assert discovered.tool_name == "superset_list_charts"
    assert discovered.duration_ms >= 0
    get.assert_awaited_with(config.url, "secret-token", server_id="superset")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "arguments",
    [
        {},
        {"request": {"limit": "1"}},
        {"request": {"limit": 0}},
        {"request": {"limit": 1}, "extra": True},
    ],
)
async def test_invalid_nested_arguments_do_not_execute(setup, arguments) -> None:
    config, _, calls, _ = setup
    with pytest.raises(execution.ExecutionError, match="input schema") as caught:
        await execution.execute_tool(
            config,
            McpToolExecutionRequest(
                tool_name="superset_list_charts", arguments=arguments
            ),
        )
    assert caught.value.status_code == 422
    assert calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize("name", ["list_charts", "unknown", "superset_call_tool"])
async def test_unknown_or_raw_dispatcher_tool_does_not_execute(setup, name) -> None:
    config, _, calls, _ = setup
    with pytest.raises(execution.ExecutionError) as caught:
        await execution.execute_tool(config, McpToolExecutionRequest(tool_name=name))
    assert caught.value.status_code == 404
    assert calls == []


@pytest.mark.asyncio
async def test_tool_error_remains_mcp_result(setup) -> None:
    config, _, calls, _ = setup
    result = await execution.execute_tool(
        config,
        McpToolExecutionRequest(
            tool_name="superset_list_charts", arguments={"request": {"limit": 99}}
        ),
    )
    assert result.is_error
    assert result.content
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_openmetadata_base_tool_calls_raw_name(setup) -> None:
    _, catalog, calls, _ = setup
    catalog.server_id = "openmetadata"
    catalog.tools[0].name = "openmetadata_health_check"
    result = await execution.execute_tool(
        McpServerConfig("openmetadata", "OpenMetadata", "https://metadata.example/mcp"),
        McpToolExecutionRequest(tool_name="openmetadata_health_check"),
    )
    assert result.server_id == "openmetadata"
    assert calls == [("health_check", {})]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "schema", [None, {"type": "not-a-type"}, {"$ref": "https://secret.example/schema"}]
)
async def test_unavailable_invalid_or_remote_schema_fails_closed(setup, schema) -> None:
    config, catalog, calls, _ = setup
    catalog.tools[2].input_schema = schema
    with pytest.raises(execution.ExecutionError) as caught:
        await execution.execute_tool(
            config, McpToolExecutionRequest(tool_name="superset_list_charts")
        )
    assert caught.value.code == "mcp_schema_unavailable"
    assert calls == []


@pytest.mark.asyncio
async def test_missing_dispatcher_does_not_execute(setup) -> None:
    config, catalog, calls, _ = setup
    catalog.tools.pop(1)
    with pytest.raises(execution.ExecutionError) as caught:
        await execution.execute_tool(
            config,
            McpToolExecutionRequest(
                tool_name="superset_list_charts", arguments={"request": {"limit": 1}}
            ),
        )
    assert caught.value.code == "mcp_dispatcher_unavailable"
    assert calls == []


@pytest.mark.asyncio
async def test_timeout_bounds_catalog_lookup(
    setup, monkeypatch: pytest.MonkeyPatch
) -> None:
    import asyncio

    config, _, calls, get = setup

    async def wait(*args, **kwargs):
        await asyncio.sleep(1)

    get.side_effect = wait
    monkeypatch.setattr(execution, "EXECUTION_TIMEOUT_SECONDS", 0.01)
    with pytest.raises(execution.ExecutionError) as caught:
        await execution.execute_tool(
            config, McpToolExecutionRequest(tool_name="superset_health_check")
        )
    assert caught.value.status_code == 504
    assert calls == []


@pytest.mark.asyncio
async def test_endpoint_contract_and_safe_errors(
    setup, monkeypatch: pytest.MonkeyPatch
) -> None:
    config, _, _, _ = setup
    monkeypatch.setattr(
        main.AgentSettings,
        "from_env",
        lambda: type("Settings", (), {"mcp_servers": lambda self: (config,)})(),
    )
    async with httpx2.AsyncClient(
        transport=httpx2.ASGITransport(app=main.app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/mcp-servers/superset/tools/execute",
            json={
                "tool_name": "superset_list_charts",
                "arguments": {"request": {"limit": 1}},
            },
        )
        assert response.status_code == 200
        assert response.json()["structured_content"] == {"charts": [{"id": 1}]}
        for payload in [
            {"tool_name": "superset_health_check", "source": "base"},
            {"tool_name": "superset_health_check", "arguments": []},
        ]:
            assert (
                await client.post("/mcp-servers/superset/tools/execute", json=payload)
            ).status_code == 422
        assert (
            await client.post(
                "/mcp-servers/unknown/tools/execute",
                json={"tool_name": "superset_health_check"},
            )
        ).status_code == 404
        for error in [
            CatalogError("mcp_auth_failed"),
            execution.ExecutionError("mcp_timeout"),
        ]:
            monkeypatch.setattr(main, "execute_tool", AsyncMock(side_effect=error))
            response = await client.post(
                "/mcp-servers/superset/tools/execute",
                json={"tool_name": "superset_health_check"},
            )
            assert response.status_code == error.status_code
            assert response.json()["detail"]["code"] == error.code
            assert "secret" not in response.text


@pytest.mark.parametrize(
    "error,code",
    [
        (
            httpx2.ConnectError("secret-token https://secret.example"),
            "mcp_execution_unavailable",
        ),
        (TimeoutError("secret-token"), "mcp_timeout"),
        (ExceptionGroup("secret", [TimeoutError()]), "mcp_timeout"),
        (
            httpx2.HTTPStatusError(
                "secret",
                request=httpx2.Request("POST", "https://secret.example"),
                response=httpx2.Response(401),
            ),
            "mcp_auth_failed",
        ),
    ],
)
def test_transport_errors_are_sanitized(error: Exception, code: str) -> None:
    normalized = execution._normalize_error(error)
    assert normalized.code == code
    assert "secret" not in str(normalized)
