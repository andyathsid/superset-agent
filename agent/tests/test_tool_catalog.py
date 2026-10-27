from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock

import httpx2
import pytest
from fastmcp import FastMCP
from mcp.shared.exceptions import MCPError
from mcp.types import REQUEST_TIMEOUT, CallToolResult, TextContent, Tool
from pydantic import ValidationError

from agent.mcp import catalog
from schemas.mcp import McpServerId, McpToolCatalogResponse


@pytest.mark.parametrize(
    ("name", "category"),
    [
        ("get_dashboard_chart", "Dashboards"),
        ("get_chart_query", "Charts"),
        ("explore", "Charts"),
        ("get_table_schema", "Datasets"),
        ("run_sql_query", "SQL Lab"),
        ("list_databases", "Databases"),
        ("get_user_roles", "Security & Users"),
        ("create_alert", "Alerts & Reports"),
        ("list_tags", "Annotations & Tags"),
        ("health_check", "System"),
        ("search_tools", "General"),
        ("call_tool", "General"),
    ],
)
def test_categories_preserve_priority(name: str, category: str) -> None:
    assert catalog.categorize_tool(name) == category


@pytest.mark.parametrize(
    ("name", "category"),
    [
        ("search_metadata", "Search & Discovery"),
        ("semantic_search", "Search & Discovery"),
        ("create_context_memory", "Context & Knowledge"),
        ("find_context", "Context & Knowledge"),
        ("get_asset_context", "Context & Knowledge"),
        ("get_company_context", "Context & Knowledge"),
        ("get_knowledge_content", "Context & Knowledge"),
        ("get_persona_context", "Context & Knowledge"),
        ("get_user_context", "Context & Knowledge"),
        ("search_company_context", "Context & Knowledge"),
        ("get_entity_details", "Metadata Management"),
        ("patch_entity", "Metadata Management"),
        ("create_classification", "Governance & Glossary"),
        ("create_glossary", "Governance & Glossary"),
        ("create_glossary_term", "Governance & Glossary"),
        ("create_tag", "Governance & Glossary"),
        ("create_domain", "Domains & Data Products"),
        ("create_data_product", "Domains & Data Products"),
        ("create_lineage", "Lineage"),
        ("get_entity_lineage", "Lineage"),
        ("create_test_case", "Data Quality"),
        ("get_test_definitions", "Data Quality"),
        ("root_cause_analysis", "Data Quality"),
        ("create_metric", "Metrics"),
        ("unknown_tool", "General"),
        ("get_user_roles", "General"),
    ],
)
def test_openmetadata_catalog_categories(name: str, category: str) -> None:
    item = catalog._catalog_item(
        {"name": name, "inputSchema": {}}, "base", server_id="openmetadata"
    )
    assert item.category == category
    assert item.raw_name == name
    assert item.name == f"openmetadata_{name}"


@pytest.mark.parametrize("payload", [[], {"result": []}])
def test_empty_structured_catalog(payload: object) -> None:
    result = CallToolResult(content=[], structured_content=payload)
    assert catalog.parse_search_result(result) == []


def test_text_fallback_preserves_wire_schema() -> None:
    schema = {
        "properties": {"request": {"anyOf": [{"type": "object"}, {"type": "null"}]}},
        "required": ["request"],
    }
    result = CallToolResult(
        structured_content={"unsupported": []},
        content=[
            TextContent(type="text", text="Non-JSON preamble"),
            TextContent(
                type="text",
                text=json.dumps([{"name": "generate_chart", "inputSchema": schema}]),
            ),
        ],
    )
    item = catalog._catalog_item(catalog.parse_search_result(result)[0], "discovered")
    assert item.input_schema == schema
    assert item.description == ""


@pytest.mark.parametrize("schema", [None, {}])
def test_schema_missing_and_empty_stay_distinct(schema: object) -> None:
    item = catalog._catalog_item(
        {"name": "health_check", "inputSchema": schema}, "base"
    )
    assert item.input_schema == schema


@pytest.mark.parametrize(
    "payload",
    [
        None,
        {},
        {"name": " "},
        {"name": 1},
        {"name": "x", "description": 1},
        {"name": "x", "inputSchema": []},
    ],
)
def test_invalid_metadata_is_rejected(payload: object) -> None:
    with pytest.raises((catalog.CatalogError, ValidationError)):
        catalog._catalog_item(payload, "discovered")


@pytest.mark.parametrize(
    "result",
    [
        CallToolResult(content=[], structured_content={"tools": []}),
        CallToolResult(content=[TextContent(type="text", text="broken")]),
        CallToolResult(content=[TextContent(type="text", text="[]")], is_error=True),
    ],
)
def test_invalid_search_or_mcp_error_is_rejected(result: CallToolResult) -> None:
    with pytest.raises(catalog.CatalogError, match="unavailable"):
        catalog.parse_search_result(result)


class StubClient:
    def __init__(self) -> None:
        self.base = [
            Tool(name="search_tools", input_schema={}),
            Tool(name="health_check", description="Base description", input_schema={}),
        ]
        self.result = CallToolResult(
            content=[],
            structured_content={
                "result": [
                    {"name": "generate_chart", "inputSchema": {}},
                    {"name": "health_check", "description": "Duplicate"},
                ]
            },
        )
        self.closed = False
        self.calls: list[tuple[str, dict[str, object]]] = []

    async def __aenter__(self) -> StubClient:
        return self

    async def __aexit__(self, *args: object) -> None:
        self.closed = True

    async def list_tools(self, *, cache_mode: str) -> list[Tool]:
        assert cache_mode == "bypass"
        return self.base

    async def call_tool_mcp(
        self, name: str, arguments: dict[str, object]
    ) -> CallToolResult:
        self.calls.append((name, arguments))
        return self.result


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> StubClient:
    stub = StubClient()
    monkeypatch.setattr(catalog, "FastMCPClient", lambda transport: stub)
    return stub


@pytest.mark.asyncio
async def test_discovery_merges_metadata_and_closes_session(client: StubClient) -> None:
    response = await catalog._discover_catalog("https://superset.example/mcp", "secret")
    assert [item.name for item in response.tools] == [
        "superset_generate_chart",
        "superset_health_check",
        "superset_search_tools",
    ]
    assert response.server_id == "superset"
    assert [item.raw_name for item in response.tools] == [
        "generate_chart",
        "health_check",
        "search_tools",
    ]
    assert [item.source for item in response.tools] == ["discovered", "base", "base"]
    assert response.tools[1].description == "Base description"
    assert client.calls == [("search_tools", {"query": ""})]
    assert client.closed
    assert response.fetched_at.tzinfo == UTC


@pytest.mark.asyncio
async def test_server_without_search_tool(client: StubClient) -> None:
    client.base = client.base[1:]
    response = await catalog._discover_catalog("https://superset.example/mcp", None)
    assert [item.name for item in response.tools] == ["superset_health_check"]
    assert client.calls == []
    assert client.closed


@pytest.mark.asyncio
async def test_discovery_with_real_in_memory_mcp_server(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    server = FastMCP("catalog-test")

    @server.tool
    async def health_check() -> str:
        return "ok"

    @server.tool
    async def search_tools(query: str) -> list[dict[str, Any]]:
        assert query == ""
        return [{"name": "generate_chart", "inputSchema": {}}]

    monkeypatch.setattr(
        catalog, "StreamableHttpTransport", lambda *args, **kwargs: server
    )

    async with asyncio.timeout(10):
        response = await catalog._discover_catalog("https://superset.example/mcp", None)

    assert [item.name for item in response.tools] == [
        "superset_generate_chart",
        "superset_health_check",
        "superset_search_tools",
    ]
    assert response.tools[0].source == "discovered"
    assert response.tools[0].input_schema == {}


@pytest.mark.asyncio
async def test_discovery_transport_failure_is_normalized_and_session_closed(
    monkeypatch: pytest.MonkeyPatch, client: StubClient
) -> None:
    monkeypatch.setattr(
        client, "list_tools", AsyncMock(side_effect=httpx2.ReadTimeout("secret"))
    )

    with pytest.raises(catalog.CatalogError) as caught:
        await catalog._discover_catalog("https://superset.example/mcp", "secret")

    assert caught.value.code == "mcp_timeout"
    assert "secret" not in str(caught.value)
    assert client.closed


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "result",
    [
        CallToolResult(content=[], is_error=True),
        CallToolResult(content=[], structured_content={"result": [{"name": " "}]}),
        CallToolResult(
            content=[],
            structured_content={
                "result": [{"name": "health_check", "inputSchema": []}]
            },
        ),
    ],
)
async def test_search_failure_never_returns_base_only(
    client: StubClient, result: CallToolResult
) -> None:
    client.result = result
    with pytest.raises(catalog.CatalogError):
        await catalog._discover_catalog("https://superset.example/mcp", None)
    assert client.closed


@pytest.mark.asyncio
async def test_invalid_transport_configuration_is_normalized() -> None:
    with pytest.raises(catalog.CatalogError) as caught:
        await catalog._discover_catalog("invalid-url", None)
    assert caught.value.code == "mcp_catalog_unavailable"


@pytest.mark.parametrize("status", [401, 403])
def test_nested_auth_error_mapping(status: int) -> None:
    response = httpx2.Response(
        status, request=httpx2.Request("POST", "https://superset.example/mcp")
    )
    original = httpx2.HTTPStatusError(
        "secret", request=response.request, response=response
    )
    wrapper = RuntimeError("connection failed")
    wrapper.__cause__ = original
    error = catalog._normalize_error(ExceptionGroup("transport", [wrapper]))
    assert error.code == "mcp_auth_failed"
    assert error.status_code == 502
    assert "secret" not in str(error)


@pytest.mark.parametrize(
    "original",
    [
        httpx2.ReadTimeout("secret"),
        TimeoutError("secret"),
        MCPError(REQUEST_TIMEOUT, "secret"),
    ],
)
def test_timeout_mapping(original: Exception) -> None:
    error = catalog._normalize_error(original)
    assert error.code == "mcp_timeout"
    assert error.status_code == 504
    assert "secret" not in str(error)


@pytest.mark.asyncio
async def test_cache_coalesces_misses_expires_and_isolates_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = [0.0]
    calls: list[tuple[McpServerId, str, str | None]] = []

    async def discover(
        url: str, api_key: str | None, *, server_id: McpServerId
    ) -> McpToolCatalogResponse:
        calls.append((server_id, url, api_key))
        await asyncio.sleep(0)
        return McpToolCatalogResponse(
            server_id=server_id, fetched_at=datetime.now(UTC), tools=[]
        )

    monkeypatch.setattr(catalog, "_discover_catalog", discover)
    cache = catalog.ToolCatalogCache(clock=lambda: now[0])
    first, second = await asyncio.gather(
        cache.get("https://one.example/mcp", "key-a"),
        cache.get("https://one.example/mcp", "key-a"),
    )
    assert len(calls) == 1
    assert first.fetched_at == second.fetched_at
    first.tools.append(catalog._catalog_item({"name": "injected"}, "base"))
    assert (await cache.get("https://one.example/mcp", "key-a")).tools == []
    await cache.get("https://one.example/mcp", "key-b")
    await cache.get("https://two.example/mcp", "key-a")
    assert len(calls) == 3
    metadata = await cache.get(
        "https://one.example/mcp", "key-a", server_id="openmetadata"
    )
    assert metadata.server_id == "openmetadata"
    assert (await cache.get("https://one.example/mcp", "key-a")).server_id == "superset"
    assert len(calls) == 4
    assert "key-a" not in repr(cache._entries.keys())
    assert "key-b" not in repr(cache._locks.keys())
    now[0] = 300.0
    await cache.get("https://one.example/mcp", "key-a")
    assert len(calls) == 5


@pytest.mark.asyncio
async def test_openmetadata_never_calls_superset_search_contract(
    client: StubClient,
) -> None:
    response = await catalog._discover_catalog(
        "https://metadata.example/mcp", "metadata-secret", server_id="openmetadata"
    )
    assert response.server_id == "openmetadata"
    assert [item.name for item in response.tools] == [
        "openmetadata_health_check",
        "openmetadata_search_tools",
    ]
    assert [item.raw_name for item in response.tools] == [
        "health_check",
        "search_tools",
    ]
    assert all(
        item.category == "General" and item.source == "base" for item in response.tools
    )
    assert client.calls == []
    assert client.closed


@pytest.mark.asyncio
async def test_openmetadata_discovery_with_real_server(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    server = FastMCP("metadata-catalog-test")

    @server.tool
    async def search_tools(required_filter: str) -> str:
        """Search metadata using a server-specific contract."""
        pytest.fail("Catalog must only list OpenMetadata tools")

    def transport(
        url: str, *, auth: str | None, httpx_client_factory: object
    ) -> FastMCP:
        assert auth == "metadata-secret"
        return server

    monkeypatch.setattr(catalog, "StreamableHttpTransport", transport)
    async with asyncio.timeout(10):
        response = await catalog._discover_catalog(
            "https://metadata.example/mcp", "metadata-secret", server_id="openmetadata"
        )
    assert response.server_id == "openmetadata"
    assert [item.name for item in response.tools] == ["openmetadata_search_tools"]
    assert response.tools[0].raw_name == "search_tools"
    assert response.tools[0].input_schema is not None
    assert response.tools[0].input_schema["required"] == ["required_filter"]


@pytest.mark.parametrize("server_id", ["superset", "openmetadata"])
def test_same_raw_tool_name_has_distinct_catalog_identity(
    server_id: McpServerId,
) -> None:
    item = catalog._catalog_item(
        {"name": "get_table_schema", "inputSchema": {}}, "base", server_id=server_id
    )
    assert item.name == f"{server_id}_get_table_schema"
    assert item.raw_name == "get_table_schema"
    assert item.category == ("Datasets" if server_id == "superset" else "General")


@pytest.mark.asyncio
async def test_failed_refresh_is_not_cached_or_served_stale(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = [0.0]
    response = McpToolCatalogResponse(fetched_at=datetime.now(UTC), tools=[])
    discover = AsyncMock(
        side_effect=[
            response,
            catalog.CatalogError("mcp_catalog_unavailable"),
            response,
        ]
    )
    monkeypatch.setattr(catalog, "_discover_catalog", discover)
    cache = catalog.ToolCatalogCache(clock=lambda: now[0])
    await cache.get("https://superset.example/mcp", None)
    now[0] = 300.0
    with pytest.raises(catalog.CatalogError):
        await cache.get("https://superset.example/mcp", None)
    await cache.get("https://superset.example/mcp", None)
    assert discover.await_count == 3
