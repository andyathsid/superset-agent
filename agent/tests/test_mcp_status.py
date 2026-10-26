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

import os
from typing import Any

import httpx2
import pytest

import main
from agent.tools import McpProbeStatus, McpServerProbe

_agent_url = os.getenv("AGENT_URL", "http://localhost:2026").rstrip("/")
_e2e = pytest.mark.skipif(
    os.getenv("E2E") != "1",
    reason="Start the live agent and set E2E=1 to run this test.",
)


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["connected", "needs-auth", "failed"])
async def test_status_reports_configured_url_and_probe_result(
    monkeypatch: pytest.MonkeyPatch, status: McpProbeStatus
) -> None:
    monkeypatch.setenv("MODEL_NAME", "test-model")
    monkeypatch.setenv("MODEL_BASE_URL", "https://models.example/v1")
    monkeypatch.setenv("MODEL_API_KEY", "model-secret")
    monkeypatch.setenv("MODEL_PROVIDER", "openai")
    monkeypatch.setenv("SUPERSET_MCP_URL", "https://superset.example/mcp")
    monkeypatch.setenv("SUPERSET_MCP_API_KEY", "mcp-secret")

    probe_result: McpServerProbe = {
        "status": status,
        "tools": ["health_check"] if status == "connected" else [],
    }

    async def fake_probe(url: str, api_key: str | None) -> McpServerProbe:
        assert url == "https://superset.example/mcp"
        assert api_key == "mcp-secret"
        return probe_result

    monkeypatch.setattr(main, "probe_mcp_server", fake_probe)

    response = await main.get_mcp_server_status()
    server = response.servers[0]
    assert server.url == "https://superset.example/mcp"
    assert server.status == status
    assert server.tools == probe_result["tools"]
    assert server.checked_at == response.checked_at
    assert "mcp-secret" not in response.model_dump_json()
    assert "model-secret" not in response.model_dump_json()


@_e2e
@pytest.mark.asyncio
async def test_mcp_status_endpoint_reports_connected_superset() -> None:
    async with httpx2.AsyncClient(timeout=httpx2.Timeout(10.0)) as client:
        response = await client.get(f"{_agent_url}/mcp-servers/status")

    response.raise_for_status()

    body: dict[str, Any] = response.json()
    assert body["checked_at"]

    assert len(body["servers"]) == 1
    superset = body["servers"][0]
    assert superset["id"] == "superset"
    assert superset["name"] == "Superset"
    assert superset["transport"] == "HTTP"
    assert superset["url"].startswith(("http://", "https://"))
    assert superset["status"] == "connected"
    assert isinstance(superset["tools"], list)
    assert superset["tools"]
    assert superset["checked_at"]
