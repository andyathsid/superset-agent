from __future__ import annotations

from typing import Literal

import httpx2
import pytest
from fastmcp import FastMCP
from fastmcp.client.group import ClientGroup
from langchain_core.tools import StructuredTool
from pydantic import SecretStr

from agent.config import McpServerConfig
from agent.mcp import client as mcp_client
from agent.mcp import transport as mcp_transport


@pytest.mark.asyncio
async def test_create_tools_keeps_adapter_open_for_the_agent_run(monkeypatch) -> None:
    events: list[str] = []

    class FakeTransport:
        def __init__(
            self,
            url: str,
            auth: str | None = None,
            httpx_client_factory: object | None = None,
        ) -> None:
            assert url == "https://superset.example/mcp"
            assert auth == "api-key"
            assert callable(httpx_client_factory)
            events.append("transport-created")

    class FakeClient:
        def __init__(self, transport: FakeTransport, cache: object) -> None:
            assert isinstance(transport, FakeTransport)
            assert cache is not None
            events.append("client-created")

    class FakeAdapter:
        def __init__(self, group: ClientGroup) -> None:
            assert list(group.clients) == ["superset"]
            assert isinstance(group.clients["superset"], FakeClient)

        async def __aenter__(self) -> FakeAdapter:
            events.append("adapter-entered")
            return self

        async def __aexit__(self, *args: object) -> None:
            events.append("adapter-exited")

        async def list_tools(self, *, cache_mode: str) -> list[StructuredTool]:
            assert cache_mode == "use"
            events.append("tools-discovered")
            return [
                StructuredTool.from_function(
                    lambda: "result", name="superset_tool", description="Test"
                )
            ]

    monkeypatch.setattr(mcp_client, "StreamableHttpTransport", FakeTransport)
    monkeypatch.setattr(mcp_client, "FastMCPClient", FakeClient)
    monkeypatch.setattr(mcp_client, "MCPAdapter", FakeAdapter)

    async with mcp_client.create_tools(
        [
            McpServerConfig(
                "superset",
                "Superset",
                "https://superset.example/mcp",
                SecretStr("api-key"),
            )
        ]
    ) as result:
        assert [tool.name for tool in result] == ["superset_tool"]
        assert events == [
            "transport-created",
            "client-created",
            "adapter-entered",
            "tools-discovered",
        ]

    assert events[-1] == "adapter-exited"


@pytest.mark.asyncio
@pytest.mark.parametrize("include_openmetadata", [False, True])
async def test_prefixed_tools_call_the_original_server_and_name(
    monkeypatch, include_openmetadata: bool
) -> None:
    superset = FastMCP("superset")
    openmetadata = FastMCP("openmetadata")

    @superset.tool
    async def search(query: str) -> str:
        """Search Superset."""
        return f"superset: {query}"

    @openmetadata.tool(name="search")
    async def search_metadata(query: str) -> str:
        """Search OpenMetadata."""
        return f"openmetadata: {query}"

    targets = {
        "https://superset.example/mcp": superset,
        "https://metadata.example/mcp": openmetadata,
    }
    received_auth: list[str | None] = []

    def transport(
        url: str, *, auth: str | None, httpx_client_factory: object
    ) -> FastMCP:
        received_auth.append(auth)
        return targets[url]

    monkeypatch.setattr(mcp_client, "StreamableHttpTransport", transport)
    servers = [
        McpServerConfig("superset", "Superset", "https://superset.example/mcp"),
    ]
    if include_openmetadata:
        servers.append(
            McpServerConfig(
                "openmetadata",
                "OpenMetadata",
                "https://metadata.example/mcp",
                SecretStr("metadata-token"),
            )
        )
    async with mcp_client.create_tools(servers) as tools:
        expected_names = ["superset_search"]
        if include_openmetadata:
            expected_names.append("openmetadata_search")
        assert [tool.name for tool in tools] == expected_names
        assert "superset: sales" in str(await tools[0].ainvoke({"query": "sales"}))
        if include_openmetadata:
            assert "openmetadata: sales" in str(
                await tools[1].ainvoke({"query": "sales"})
            )
    assert received_auth == (
        [None, "metadata-token"] if include_openmetadata else [None]
    )


@pytest.mark.asyncio
async def test_second_server_failure_closes_first_session(monkeypatch) -> None:
    events: list[str] = []

    class FakeClient:
        def __init__(self, url: str, *, cache: object) -> None:
            self.url = url

        async def __aenter__(self):
            if self.url == "https://metadata.example/mcp":
                raise RuntimeError("Connection failed")
            events.append("entered")
            return self

        async def __aexit__(self, *args: object) -> None:
            events.append("exited")

    monkeypatch.setattr(
        mcp_client, "StreamableHttpTransport", lambda url, **kwargs: url
    )
    monkeypatch.setattr(mcp_client, "FastMCPClient", FakeClient)
    monkeypatch.setattr(mcp_client, "MCPAdapter", lambda group: group)
    servers = [
        McpServerConfig("superset", "Superset", "https://superset.example/mcp"),
        McpServerConfig("openmetadata", "OpenMetadata", "https://metadata.example/mcp"),
    ]
    with pytest.raises(RuntimeError, match="Connection failed"):
        async with mcp_client.create_tools(servers):
            pytest.fail("Graph must not run with incomplete connections")
    assert events == ["entered", "exited"]


def test_tool_cache_isolates_servers_urls_and_credentials() -> None:
    def cache(
        server_id: Literal["superset", "openmetadata"] = "superset",
        url: str = "https://same.example/mcp",
        token: str = "one",
    ):
        return mcp_client._tool_cache(
            McpServerConfig(server_id, "Test", url, SecretStr(token))
        )

    first = cache()
    assert first.partition == cache().partition
    assert first.partition != cache(server_id="openmetadata").partition
    assert first.partition != cache(url="https://other.example/mcp").partition
    assert first.partition != cache(token="two").partition


@pytest.mark.asyncio
async def test_close_shared_mcp_resources_closes_the_worker_pool(monkeypatch) -> None:
    events: list[str] = []

    class FakePool:
        async def aclose(self) -> None:
            events.append("pool-closed")

    monkeypatch.setattr(mcp_transport, "_HTTP_POOL", FakePool())

    await mcp_transport.close_shared_mcp_resources()

    assert events == ["pool-closed"]


@pytest.mark.asyncio
async def test_http_client_factory_keeps_the_shared_pool_open(monkeypatch) -> None:
    closed = False

    class FakePool:
        async def aclose(self) -> None:
            nonlocal closed
            closed = True

    monkeypatch.setattr(mcp_transport, "_HTTP_POOL", FakePool())

    client = mcp_transport.http_client_factory(
        headers={"X-Test": "value"},
        timeout=httpx2.Timeout(12.0),
        follow_redirects=True,
    )

    assert client.headers["X-Test"] == "value"
    assert client.follow_redirects is True
    assert client.timeout.read == 12.0

    transport = client._transport
    assert isinstance(transport, mcp_transport._SharedPool)

    await client.aclose()

    assert closed is False


def test_http_client_factory_uses_mcp_timeouts_by_default() -> None:
    client = mcp_transport.http_client_factory()

    assert client.timeout.connect == 30.0
    assert client.timeout.read == 300.0
