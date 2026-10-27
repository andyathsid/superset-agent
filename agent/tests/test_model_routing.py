"""Provider routing and credential-free response attribution."""

import json
from dataclasses import replace
from typing import Any, cast

import httpx
import pytest
from langchain.agents.middleware import AgentState
from langchain.messages import AIMessage
from langchain_anthropic import ChatAnthropic
from langchain_ollama import ChatOllama
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
        ("ollama", ChatOllama),
        ("custom", ChatOpenAI),
    ],
)
def test_selects_provider_adapter(provider: str, adapter: type) -> None:
    model = create_chat_model(settings(provider))
    assert isinstance(model, adapter)


@pytest.mark.parametrize("suffix", ["", "/", "/v1", "/v1/"])
def test_ollama_uses_native_chat_endpoint(
    suffix: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_send(
        client: httpx.Client, request: httpx.Request, **kwargs: Any
    ) -> httpx.Response:
        assert str(request.url) == "http://localhost:11434/api/chat"
        payload = json.loads(request.content)
        assert payload["model"] == "provider-model"
        assert payload["options"]["temperature"] == 0
        return httpx.Response(
            200,
            request=request,
            json={
                "model": "provider-model",
                "message": {"role": "assistant", "content": "Hello"},
                "done": True,
            },
        )

    monkeypatch.setattr(httpx.Client, "send", fake_send)
    model = create_chat_model(
        replace(
            settings("ollama"),
            model_base_url=f"http://localhost:11434{suffix}",
            model_api_key=SecretStr(""),
        )
    )
    assert model.invoke("Hi", stream=False).content == "Hello"


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
