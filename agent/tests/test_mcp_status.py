"""End-to-end test for the live MCP status endpoint.

Prerequisites:
1. Start Superset MCP and ensure it is reachable from the agent.
2. Configure SUPERSET_MCP_URL and, if needed, SUPERSET_MCP_API_KEY in .env.
3. Start the agent in another terminal with `uv run aegra dev`.
4. Confirm the endpoint works:
   curl --fail --silent http://localhost:2026/mcp-servers/status | jq

Run:
    E2E=1 uv run pytest tests/test_mcp_status.py

Optional:
    AGENT_URL=http://another-host:2026 MCP_STATUS_E2E=1 \
      uv run pytest tests/test_mcp_status.py
"""

from __future__ import annotations

import asyncio
import os
from typing import Any

import httpx2
import pytest
from pydantic import SecretStr

import main
from agent.config import McpServerConfig
from agent.mcp import client as mcp_client
from agent.mcp.client import McpProbeStatus, McpServerProbe

_agent_url = os.getenv("AGENT_URL", "http://localhost:2026").rstrip("/")
_e2e = pytest.mark.skipif(
    os.getenv("E2E") != "1",
    reason="Start the live agent and set E2E=1 to run this test.",
)


@pytest.fixture
def status_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    for name, value in {
        "MODEL_NAME": "test-model",
        "MODEL_BASE_URL": "https://models.example/v1",
        "MODEL_API_KEY": "model-secret",
        "MODEL_PROVIDER": "openai",
        "SUPERSET_MCP_URL": "https://superset.example/mcp",
        "SUPERSET_MCP_API_KEY": "mcp-secret",
    }.items():
        monkeypatch.setenv(name, value)
    monkeypatch.delenv("OPENMETADATA_MCP_URL", raising=False)
    monkeypatch.delenv("OPENMETADATA_TOKEN", raising=False)


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["connected", "needs-auth", "failed"])
async def test_status_reports_configured_url_and_probe_result(
    monkeypatch: pytest.MonkeyPatch,
    status: McpProbeStatus,
    status_settings: None,
) -> None:
    probe_result: McpServerProbe = {
        "status": status,
        "tools": ["superset_health_check"] if status == "connected" else [],
    }

    async def fake_probe(server: McpServerConfig) -> McpServerProbe:
        assert server.url == "https://superset.example/mcp"
        assert server.token is not None
        assert server.token.get_secret_value() == "mcp-secret"
        return probe_result

    monkeypatch.setattr(main, "probe_mcp_server", fake_probe)

    response = await main.get_mcp_server_status()
    assert len(response.servers) == 1
    server = response.servers[0]
    assert server.url == "https://superset.example/mcp"
    assert server.status == status
    assert server.tools == probe_result["tools"]
    assert server.checked_at == response.checked_at
    assert "mcp-secret" not in response.model_dump_json()
    assert "model-secret" not in response.model_dump_json()


@pytest.mark.asyncio
@pytest.mark.parametrize("failed_id", [None, "superset", "openmetadata"])
async def test_status_reports_servers_independently(
    monkeypatch: pytest.MonkeyPatch,
    status_settings: None,
    failed_id: str | None,
) -> None:
    monkeypatch.setenv("OPENMETADATA_MCP_URL", "https://metadata.example/mcp")
    monkeypatch.setenv("OPENMETADATA_TOKEN", "metadata-secret")
    started: set[str] = set()
    both_started = asyncio.Event()

    async def fake_probe(server: McpServerConfig) -> McpServerProbe:
        started.add(server.id)
        if len(started) == 2:
            both_started.set()
        await asyncio.wait_for(both_started.wait(), timeout=1)
        if server.id == failed_id:
            return {"status": "failed", "tools": []}
        return {"status": "connected", "tools": [f"{server.id}_search"]}

    monkeypatch.setattr(main, "probe_mcp_server", fake_probe)
    async with httpx2.AsyncClient(
        transport=httpx2.ASGITransport(app=main.app), base_url="http://test"
    ) as client:
        response = await client.get("/mcp-servers/status")
    assert response.status_code == 200
    body = response.json()
    assert [server["id"] for server in body["servers"]] == ["superset", "openmetadata"]
    for server in body["servers"]:
        assert server["status"] == (
            "failed" if server["id"] == failed_id else "connected"
        )
        assert server["tools"] == (
            [] if server["id"] == failed_id else [f"{server['id']}_search"]
        )
        assert server["checked_at"] == body["checked_at"]
    assert body["servers"][1]["name"] == "OpenMetadata"
    assert body["servers"][1]["url"] == "https://metadata.example/mcp"
    for secret in ("metadata-secret", "mcp-secret", "model-secret"):
        assert secret not in response.text


def http_error(code: int) -> httpx2.HTTPStatusError:
    return httpx2.HTTPStatusError(
        "private connection details",
        request=httpx2.Request("POST", "https://metadata.example/mcp"),
        response=httpx2.Response(code),
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("error", "status"),
    [
        (http_error(401), "needs-auth"),
        (http_error(403), "needs-auth"),
        (
            ExceptionGroup(
                "session failed",
                [RuntimeError("other"), ExceptionGroup("nested", [http_error(401)])],
            ),
            "needs-auth",
        ),
        (http_error(500), "failed"),
        (httpx2.ConnectError("private endpoint"), "failed"),
        (httpx2.ReadTimeout("private endpoint"), "failed"),
        (TimeoutError("private endpoint"), "failed"),
        (RuntimeError("private credential"), "failed"),
    ],
)
async def test_probe_normalizes_errors(
    monkeypatch: pytest.MonkeyPatch,
    error: Exception,
    status: McpProbeStatus,
) -> None:
    def broken_transport(*args: object, **kwargs: object) -> None:
        raise error

    monkeypatch.setattr(mcp_client, "StreamableHttpTransport", broken_transport)
    result = await mcp_client.probe_mcp_server(
        McpServerConfig("openmetadata", "OpenMetadata", "https://metadata.example/mcp")
    )
    assert result == {"status": status, "tools": []}


def test_probe_classifies_chained_auth_errors() -> None:
    wrapper = RuntimeError("connection failed")
    wrapper.__cause__ = http_error(403)
    assert mcp_client._probe_failure_status(wrapper) == "needs-auth"
    wrapper.__cause__ = None
    wrapper.__context__ = http_error(401)
    assert mcp_client._probe_failure_status(wrapper) == "needs-auth"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "phase", ["success", "enter", "list", "exit", "timeout", "cancel"]
)
async def test_probe_session_lifecycle_and_timeout(
    monkeypatch: pytest.MonkeyPatch,
    phase: str,
) -> None:
    from types import SimpleNamespace

    events: list[str] = []

    class FakeClient:
        async def __aenter__(self):
            events.append("enter")
            if phase == "enter":
                raise http_error(401)
            return self

        async def __aexit__(self, *args: object) -> None:
            events.append("exit")
            if phase == "exit":
                raise RuntimeError("cleanup failed")

        async def list_tools(self, *, cache_mode: str):
            assert cache_mode == "bypass"
            if phase == "list":
                raise ExceptionGroup("failed", [http_error(403)])
            if phase == "timeout":
                await asyncio.Event().wait()
            if phase == "cancel":
                raise asyncio.CancelledError()
            return [SimpleNamespace(name="search")]

    def transport(url: str, *, auth: str | None, httpx_client_factory: Any) -> object:
        assert url == "https://metadata.example/mcp"
        assert auth == "metadata-secret"
        assert httpx_client_factory is mcp_client._status_http_client_factory
        return object()

    monkeypatch.setattr(mcp_client, "StreamableHttpTransport", transport)
    monkeypatch.setattr(mcp_client, "FastMCPClient", lambda transport: FakeClient())
    monkeypatch.setattr(mcp_client, "_MCP_STATUS_TIMEOUT", httpx2.Timeout(0.02))
    server = McpServerConfig(
        "openmetadata",
        "OpenMetadata",
        "https://metadata.example/mcp",
        SecretStr("metadata-secret"),
    )
    if phase == "cancel":
        with pytest.raises(asyncio.CancelledError):
            await mcp_client.probe_mcp_server(server)
    else:
        result = await mcp_client.probe_mcp_server(server)
        expected = (
            "connected"
            if phase == "success"
            else "needs-auth"
            if phase in {"enter", "list"}
            else "failed"
        )
        assert result == {
            "status": expected,
            "tools": ["openmetadata_search"] if phase == "success" else [],
        }
    assert events == (["enter"] if phase == "enter" else ["enter", "exit"])


@_e2e
@pytest.mark.asyncio
async def test_mcp_status_endpoint_reports_connected_superset() -> None:
    async with httpx2.AsyncClient(timeout=httpx2.Timeout(10.0)) as client:
        response = await client.get(f"{_agent_url}/mcp-servers/status")

    response.raise_for_status()

    body: dict[str, Any] = response.json()
    assert body["checked_at"]

    superset = next(server for server in body["servers"] if server["id"] == "superset")
    assert superset["id"] == "superset"
    assert superset["name"] == "Superset"
    assert superset["transport"] == "HTTP"
    assert superset["url"].startswith(("http://", "https://"))
    assert superset["status"] == "connected"
    assert isinstance(superset["tools"], list)
    assert superset["tools"]
    assert all(name.startswith("superset_") for name in superset["tools"])
    assert superset["checked_at"]
