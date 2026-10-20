"""Integrastion tests for Superset MCP agent."""

from __future__ import annotations

import json
import os
import sys
from typing import Any
import pytest

from agent import agent as agent_module
from agent.agent import build_agent
from agent.config import AgentSettings
from langchain.messages import AIMessage, ToolMessage

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


@_e2e
@pytest.mark.asyncio
async def test_agent_e2e() -> None:
    async with build_agent(AgentSettings.from_env()) as agent:
        result = await _run_agent(
            agent,
            {
                "messages": [
                    {
                        "role": "user",
                        "content": (
                            "Hello can you list available datasets in Superset?"
                        ),
                    }
                ],
            },
        )

    messages = result["messages"]

    tool_calls = [
        message
        for message in messages
        if isinstance(message, ToolMessage)
    ]

    assert tool_calls
    assert isinstance(messages[-1], AIMessage)
    assert str(messages[-1].content).strip()


@pytest.mark.asyncio
async def test_graph_skips_mcp_setup_outside_execution(monkeypatch) -> None:
    events: list[str] = []
    sentinel = object()

    class ReadRuntime:
        execution_runtime = None

    def fake_settings_from_env() -> object:
        events.append("settings-loaded")
        return object()

    def fake_build_agent(settings: object, tools: list[object]) -> object:
        assert settings is not None
        assert tools == []
        events.append("agent-created")
        return sentinel

    monkeypatch.setattr(
        agent_module.AgentSettings,
        "from_env",
        staticmethod(fake_settings_from_env),
    )
    monkeypatch.setattr(agent_module, "build_agent", fake_build_agent)

    async with agent_module.graph(ReadRuntime()) as graph:
        assert graph is sentinel

    assert events == ["settings-loaded", "agent-created"]
