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

_agent_url = os.getenv("AGENT_URL", "http://localhost:2026").rstrip("/")
_e2e = pytest.mark.skipif(
    os.getenv("E2E") != "1",
    reason="Start the live agent and set E2E=1 to run this test.",
)


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
    assert superset["status"] == "connected"
    assert isinstance(superset["tools"], list)
    assert superset["tools"]
    assert superset["checked_at"]
