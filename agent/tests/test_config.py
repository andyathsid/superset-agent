"""Tests for model-provider configuration."""

from __future__ import annotations

import pytest
from langchain_ollama import ChatOllama
from langchain_openrouter import ChatOpenRouter

from agent.agent import create_chat_model
from agent.config import AgentSettings


SETTINGS_ENV_VARS = (
    "PROVIDER",
    "OLLAMA_MODEL",
    "OLLAMA_HOST",
    "OLLAMA_NUM_CTX",
    "OPENROUTER_API_KEY",
    "OPENROUTER_BASE_URL",
    "OPENROUTER_MODEL",
    "SUPERSET_MCP_API_KEY",
)


@pytest.fixture(autouse=True)
def clear_model_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for variable in SETTINGS_ENV_VARS:
        monkeypatch.delenv(variable, raising=False)


def test_ollama_is_the_default_provider() -> None:
    settings = AgentSettings.from_env()

    assert settings.provider == "ollama"
    assert settings.ollama_model == "LiquidAI/lfm2.5-2.6b:q4_k_m"
    assert settings.ollama_base_url == "http://127.0.0.1:11434"
    assert settings.ollama_num_ctx == 32768
    assert settings.openrouter_api_key is None
    assert settings.superset_mcp_api_key is None

    model = create_chat_model(settings)
    assert isinstance(model, ChatOllama)
    assert model.model == settings.ollama_model
    assert model.base_url == settings.ollama_base_url
    assert model.num_ctx == settings.ollama_num_ctx


def test_openrouter_uses_its_lfm_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    settings = AgentSettings.from_env()
    model = create_chat_model(settings)

    assert settings.openrouter_model == "liquid/lfm-2.5-2.6b:free"
    assert isinstance(model, ChatOpenRouter)
    assert model.model_name == settings.openrouter_model


def test_openrouter_requires_an_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PROVIDER", "openrouter")

    with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
        AgentSettings.from_env()


def test_superset_mcp_api_key_is_optional(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPERSET_MCP_API_KEY", "test-mcp-key")

    settings = AgentSettings.from_env()

    assert settings.superset_mcp_api_key is not None
    assert settings.superset_mcp_api_key.get_secret_value() == "test-mcp-key"


def test_rejects_unknown_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PROVIDER", "other")

    with pytest.raises(RuntimeError, match="PROVIDER"):
        AgentSettings.from_env()


@pytest.mark.parametrize("value", ["0", "-1", "not-a-number"])
def test_rejects_invalid_ollama_context(
    monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    monkeypatch.setenv("OLLAMA_NUM_CTX", value)

    with pytest.raises(RuntimeError, match="OLLAMA_NUM_CTX"):
        AgentSettings.from_env()
