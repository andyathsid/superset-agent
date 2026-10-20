from __future__ import annotations

import httpx2
import pytest

from agent import tools


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
            assert cache is tools._TOOL_CACHE
            events.append("client-created")

    class FakeAdapter:
        def __init__(self, client: FakeClient) -> None:
            assert isinstance(client, FakeClient)

        async def __aenter__(self) -> FakeAdapter:
            events.append("adapter-entered")
            return self

        async def __aexit__(self, *args: object) -> None:
            events.append("adapter-exited")

        async def list_tools(self, *, cache_mode: str) -> list[str]:
            assert cache_mode == "use"
            events.append("tools-discovered")
            return ["tool"]

    monkeypatch.setattr(tools, "StreamableHttpTransport", FakeTransport)
    monkeypatch.setattr(tools, "FastMCPClient", FakeClient)
    monkeypatch.setattr(tools, "MCPAdapter", FakeAdapter)

    async with tools.create_tools("https://superset.example/mcp", "api-key") as result:
        assert result == ["tool"]
        assert events == [
            "transport-created",
            "client-created",
            "adapter-entered",
            "tools-discovered",
        ]

    assert events[-1] == "adapter-exited"


@pytest.mark.asyncio
async def test_close_shared_mcp_resources_closes_the_worker_pool(monkeypatch) -> None:
    events: list[str] = []

    class FakePool:
        async def aclose(self) -> None:
            events.append("pool-closed")

    monkeypatch.setattr(tools, "_HTTP_POOL", FakePool())

    await tools.close_shared_mcp_resources()

    assert events == ["pool-closed"]


@pytest.mark.asyncio
async def test_http_client_factory_keeps_the_shared_pool_open(monkeypatch) -> None:
    closed = False

    class FakePool:
        async def aclose(self) -> None:
            nonlocal closed
            closed = True

    monkeypatch.setattr(tools, "_HTTP_POOL", FakePool())

    client = tools._http_client_factory(
        headers={"X-Test": "value"},
        timeout=httpx2.Timeout(12.0),
        follow_redirects=True,
    )

    assert client.headers["X-Test"] == "value"
    assert client.follow_redirects is True
    assert client.timeout.read == 12.0

    transport = client._transport
    assert isinstance(transport, tools._SharedPool)

    await client.aclose()

    assert closed is False


def test_http_client_factory_uses_mcp_timeouts_by_default() -> None:
    client = tools._http_client_factory()

    assert client.timeout.connect == 30.0
    assert client.timeout.read == 300.0
