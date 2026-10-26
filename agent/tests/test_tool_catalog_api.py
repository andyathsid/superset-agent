from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import httpx2
import pytest

import main
from agent.mcp.catalog import CatalogError, CatalogErrorCode
from schemas.mcp import McpServerId, McpToolCatalogResponse


@pytest.fixture(autouse=True)
def settings(monkeypatch: pytest.MonkeyPatch) -> None:
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
@pytest.mark.parametrize("server_id", ["superset", "openmetadata"])
async def test_catalog_endpoint_response(
    monkeypatch: pytest.MonkeyPatch, server_id: McpServerId
) -> None:
    monkeypatch.setenv("OPENMETADATA_MCP_URL", "https://metadata.example/mcp")
    monkeypatch.setenv("OPENMETADATA_TOKEN", "metadata-secret")
    catalog = McpToolCatalogResponse(
        server_id=server_id, fetched_at=datetime.now(UTC), tools=[]
    )
    get = AsyncMock(return_value=catalog)
    monkeypatch.setattr(main.tool_catalog_cache, "get", get)

    async with httpx2.AsyncClient(
        transport=httpx2.ASGITransport(app=main.app), base_url="http://test"
    ) as client:
        response = await client.get(f"/mcp-servers/{server_id}/tools")

    assert response.status_code == 200
    assert response.json() == catalog.model_dump(mode="json")
    url, token = (
        ("https://superset.example/mcp", "mcp-secret")
        if server_id == "superset"
        else ("https://metadata.example/mcp", "metadata-secret")
    )
    get.assert_awaited_once_with(url, token, server_id=server_id)
    assert "mcp-secret" not in response.text
    assert "metadata-secret" not in response.text


@pytest.mark.asyncio
@pytest.mark.parametrize("server_id", ["superset", "openmetadata"])
@pytest.mark.parametrize(
    ("code", "status"),
    [("mcp_auth_failed", 502), ("mcp_timeout", 504), ("mcp_catalog_unavailable", 502)],
)
async def test_catalog_endpoint_safe_error(
    monkeypatch: pytest.MonkeyPatch,
    code: CatalogErrorCode,
    status: int,
    server_id: McpServerId,
) -> None:
    monkeypatch.setenv("OPENMETADATA_MCP_URL", "https://metadata.example/mcp")
    monkeypatch.setenv("OPENMETADATA_TOKEN", "metadata-secret")
    get = AsyncMock(side_effect=CatalogError(code))
    monkeypatch.setattr(main.tool_catalog_cache, "get", get)

    async with httpx2.AsyncClient(
        transport=httpx2.ASGITransport(app=main.app), base_url="http://test"
    ) as client:
        response = await client.get(f"/mcp-servers/{server_id}/tools")

    assert response.status_code == status
    assert response.json()["detail"]["code"] == code
    assert "mcp-secret" not in response.text
    assert "model-secret" not in response.text
    assert "superset.example" not in response.text
    assert "metadata.example" not in response.text
    assert "metadata-secret" not in response.text


@pytest.mark.asyncio
@pytest.mark.parametrize("server_id", ["openmetadata", "unknown"])
async def test_unconfigured_server_returns_404_without_discovery(
    monkeypatch: pytest.MonkeyPatch, server_id: str
) -> None:
    get = AsyncMock()
    monkeypatch.setattr(main.tool_catalog_cache, "get", get)
    async with httpx2.AsyncClient(
        transport=httpx2.ASGITransport(app=main.app), base_url="http://test"
    ) as client:
        response = await client.get(f"/mcp-servers/{server_id}/tools")
    assert response.status_code == 404
    assert response.json() == {"detail": "MCP server is not configured."}
    get.assert_not_awaited()


@pytest.mark.asyncio
async def test_invalid_server_url_returns_safe_catalog_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SUPERSET_MCP_URL", "invalid-url")

    async with httpx2.AsyncClient(
        transport=httpx2.ASGITransport(app=main.app), base_url="http://test"
    ) as client:
        response = await client.get("/mcp-servers/superset/tools")

    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "mcp_catalog_unavailable"
    assert "invalid-url" not in response.text
    assert "mcp-secret" not in response.text
