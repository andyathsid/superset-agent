"""Provider routing and credential-free response attribution."""

from typing import Any, cast

import pytest
from langchain.agents.middleware import AgentState
from langchain.messages import AIMessage
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langchain_openrouter import ChatOpenRouter
from langgraph.runtime import Runtime
from pydantic import SecretStr

from agent.agent import ModelMetadataMiddleware, create_chat_model
from agent.config import AgentContext, AgentSettings


def settings(provider: str) -> AgentSettings:
    return AgentSettings(
        model_name="provider-model",
        model_base_url="https://provider.example/v1",
        model_api_key=SecretStr("private-test-key"),
        model_provider=provider,
        model_selection_id=f"{provider}/provider-model",
        model_display_name="Display name",
        superset_mcp_url="http://localhost:5008/mcp",
        superset_mcp_api_key=None,
        superset_default_dataset="example",
    )


@pytest.mark.parametrize(
    ("provider", "adapter"),
    [
        ("anthropic", ChatAnthropic),
        ("openrouter", ChatOpenRouter),
        ("openai", ChatOpenAI),
        ("ollama", ChatOpenAI),
        ("custom", ChatOpenAI),
    ],
)
def test_selects_provider_adapter(provider: str, adapter: type) -> None:
    model = create_chat_model(settings(provider))
    assert isinstance(model, adapter)


def test_response_attribution_preserves_message_and_excludes_key() -> None:
    middleware = ModelMetadataMiddleware(settings("openai"))
    message = AIMessage(
        content="Hello",
        id="response-1",
        additional_kwargs={"metadata": {"existing": True}},
    )
    result = middleware.after_model(
        cast(AgentState, {"messages": [message]}), Runtime(context=AgentContext())
    )
    assert result is not None
    updated: Any = result["messages"][0]
    assert updated.id == "response-1"
    assert updated.content == "Hello"
    assert updated.additional_kwargs["metadata"]["existing"] is True
    assert updated.additional_kwargs["metadata"]["ui_model"] == middleware.identity
    assert "private-test-key" not in str(result)
    assert "ui_model" not in message.additional_kwargs["metadata"]


@pytest.mark.asyncio
async def test_checkpoint_graph_needs_no_model_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from types import SimpleNamespace

    from agent.agent import graph
    from langgraph_sdk.runtime import ServerRuntime

    for name in ("MODEL_API_KEY", "MODEL_NAME", "MODEL_BASE_URL"):
        monkeypatch.delenv(name, raising=False)
    runtime = cast(
        ServerRuntime[AgentContext], SimpleNamespace(execution_runtime=None)
    )
    async with graph(runtime) as compiled:
        assert "messages" in compiled.get_input_jsonschema()["properties"]
