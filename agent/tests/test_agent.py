"""Integrastion tests for Superset MCP agent."""

from __future__ import annotations

import json
import os
import sys
from collections.abc import AsyncGenerator, Sequence
from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import Any, cast

import pytest
from agent import agent as agent_module
from agent.config import AgentContext, AgentSettings, McpServerConfig
from langchain.messages import AIMessage, ToolMessage
from langgraph_sdk.runtime import ServerRuntime
from pydantic import SecretStr

_MAX_TOOL_CONTENT_CHARS = 800
_e2e = pytest.mark.skipif(
    os.getenv("E2E") != "1",
    reason="Set E2E=1 to run the integration test.",
)


def _safe_print(text: str) -> None:
    encoding = sys.stdout.encoding or "utf-8"
    print(text.encode(encoding, errors="backslashreplace").decode(encoding))


def _render(message: Any) -> str:
    if isinstance(message, ToolMessage):
        content = message.content
        try:
            parsed = json.loads(content) if isinstance(content, str) else content
            content = json.dumps(parsed, indent=2, ensure_ascii=False)
        except (TypeError, ValueError):
            content = str(content)

        if len(content) > _MAX_TOOL_CONTENT_CHARS:
            content = (
                content[:_MAX_TOOL_CONTENT_CHARS]
                + f"\n... [truncated, {len(content)} chars total]"
            )

        header = (
            "================================= Tool Message "
            "=================================\n"
            f"Name: {message.name}"
        )
        return f"{header}\n{content}"

    return message.pretty_repr()


async def _run_agent(agent: Any, agent_input: dict[str, Any]) -> dict[str, Any]:
    """Run the agent and print each new message as the graph advances."""
    final_state = None
    seen = 0

    async for state in agent.astream(agent_input, stream_mode="values"):
        final_state = state
        messages = state["messages"]
        for message in messages[seen:]:
            _safe_print("")
            _safe_print(_render(message))
            _safe_print("")
        seen = len(messages)

    assert final_state is not None
    return final_state


@pytest.mark.asyncio
async def test_graph_passes_configured_servers_and_keeps_tools_open(
    monkeypatch,
) -> None:
    settings = AgentSettings(
        model_name="test",
        model_base_url="https://model.example/v1",
        model_api_key=SecretStr("model-secret"),
        superset_mcp_url="https://superset.example/mcp",
        superset_mcp_api_key=None,
        superset_default_dataset="test",
        openmetadata_mcp_url="https://metadata.example/mcp",
        openmetadata_token=SecretStr("metadata-secret"),
    )
    events: list[str] = []
    tools = [object()]

    @asynccontextmanager
    async def fake_create_tools(
        servers: Sequence[McpServerConfig],
    ) -> AsyncGenerator[list[object], None]:
        assert tuple(servers) == settings.mcp_servers()
        events.append("opened")
        try:
            yield tools
        finally:
            events.append("closed")

    def fake_build_agent(
        received_settings: AgentSettings, received_tools: list[object]
    ) -> str:
        assert received_settings is settings
        assert received_tools is tools
        assert events == ["opened"]
        return "compiled-agent"

    monkeypatch.setattr(
        AgentSettings, "from_env", classmethod(lambda cls, context: settings)
    )
    monkeypatch.setattr(agent_module, "create_tools", fake_create_tools)
    monkeypatch.setattr(agent_module, "build_agent", fake_build_agent)
    runtime = cast(
        ServerRuntime[AgentContext],
        SimpleNamespace(execution_runtime=SimpleNamespace(context=AgentContext())),
    )
    async with agent_module.graph(runtime) as compiled:
        assert compiled == "compiled-agent"
        assert events == ["opened"]
    assert events == ["opened", "closed"]


@_e2e
@pytest.mark.asyncio
async def test_agent_e2e() -> None:

    runtime = cast(
        ServerRuntime[AgentContext],
        SimpleNamespace(
            execution_runtime=SimpleNamespace(context=AgentContext()),
        ),
    )

    async with agent_module.graph(runtime) as agent:
        result = await _run_agent(
            agent,
            {
                "messages": [
                    {
                        "role": "user",
                        "content": "Hello can you list available datasets in Superset?",
                    }
                ],
            },
        )

    messages = result["messages"]
    tool_calls = [message for message in messages if isinstance(message, ToolMessage)]

    assert tool_calls
    assert isinstance(messages[-1], AIMessage)
    assert str(messages[-1].content).strip()
