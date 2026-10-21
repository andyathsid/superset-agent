"""Tests for agent configuration."""

from __future__ import annotations

import pytest

from agent.config import AgentContext, AgentSettings

SETTINGS_ENV_VARS = (
    "MODEL_NAME",
    "MODEL_BASE_URL",
    "MODEL_API_KEY",
    "MODEL_PROVIDER",
    "SUPERSET_MCP_URL",
    "SUPERSET_MCP_API_KEY",
    "SUPERSET_DEFAULT_DATASET",
)


@pytest.fixture(autouse=True)
def clear_settings_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for variable in SETTINGS_ENV_VARS:
        monkeypatch.delenv(variable, raising=False)


def set_required_model_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MODEL_NAME", "environment-model")
    monkeypatch.setenv("MODEL_BASE_URL", "https://provider.example/v1/")
    monkeypatch.setenv("MODEL_API_KEY", "environment-key")


def test_loads_model_configuration_from_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    set_required_model_environment(monkeypatch)

    settings = AgentSettings.from_env()

    assert settings.model_name == "environment-model"
    assert settings.model_base_url == "https://provider.example/v1"
    assert settings.model_api_key.get_secret_value() == "environment-key"


@pytest.mark.parametrize(
    ("missing_variable", "error_message"),
    [
        ("MODEL_NAME", "MODEL_NAME"),
        ("MODEL_BASE_URL", "MODEL_BASE_URL"),
        ("MODEL_API_KEY", "MODEL_API_KEY"),
    ],
)
def test_requires_environment_model_configuration(
    monkeypatch: pytest.MonkeyPatch,
    missing_variable: str,
    error_message: str,
) -> None:
    set_required_model_environment(monkeypatch)
    monkeypatch.delenv(missing_variable)

    with pytest.raises(RuntimeError, match=error_message):
        AgentSettings.from_env()


@pytest.mark.parametrize(
    "base_url",
    [
        "provider.example/v1",
        "ftp://provider.example/v1",
        "https:///missing-host",
    ],
)
def test_rejects_invalid_model_base_url(
    monkeypatch: pytest.MonkeyPatch,
    base_url: str,
) -> None:
    set_required_model_environment(monkeypatch)
    monkeypatch.setenv("MODEL_BASE_URL", base_url)

    with pytest.raises(RuntimeError, match=r"valid HTTP\(S\) URL"):
        AgentSettings.from_env()


def test_runtime_context_overrides_model_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    set_required_model_environment(monkeypatch)
    context = AgentContext(
        model_name=" runtime-model ",
        model_base_url="https://runtime.example/v1/",
        model_api_key=" runtime-key ",
    )

    settings = AgentSettings.from_env(context)

    assert settings.model_name == "runtime-model"
    assert settings.model_base_url == "https://runtime.example/v1"
    assert settings.model_api_key.get_secret_value() == "runtime-key"


def test_partial_runtime_context_uses_environment_fallbacks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    set_required_model_environment(monkeypatch)

    settings = AgentSettings.from_env(AgentContext(model_name="runtime-model"))

    assert settings.model_name == "runtime-model"
    assert settings.model_base_url == "https://provider.example/v1"
    assert settings.model_api_key.get_secret_value() == "environment-key"


def test_explicitly_empty_runtime_api_key_uses_placeholder(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    set_required_model_environment(monkeypatch)

    settings = AgentSettings.from_env(AgentContext(model_api_key=""))

    assert settings.model_api_key.get_secret_value() == "not-required"


def test_explicitly_empty_runtime_model_does_not_use_environment_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    set_required_model_environment(monkeypatch)

    with pytest.raises(RuntimeError, match="MODEL_NAME"):
        AgentSettings.from_env(AgentContext(model_name=""))


def test_uses_superset_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    set_required_model_environment(monkeypatch)

    settings = AgentSettings.from_env()

    assert settings.superset_mcp_url == "http://localhost:5008/mcp"
    assert settings.superset_default_dataset == "wb_health_population"
    assert settings.superset_mcp_api_key is None


def test_runtime_provider_overrides_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    set_required_model_environment(monkeypatch)
    monkeypatch.setenv("MODEL_PROVIDER", "openrouter")
    settings = AgentSettings.from_env(AgentContext(model_provider="anthropic"))
    assert settings.model_provider == "anthropic"


def test_rejects_unknown_environment_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    set_required_model_environment(monkeypatch)
    monkeypatch.setenv("MODEL_PROVIDER", "unknown")
    with pytest.raises(RuntimeError, match="Unsupported model provider"):
        AgentSettings.from_env()


def test_loads_superset_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    set_required_model_environment(monkeypatch)
    monkeypatch.setenv("SUPERSET_MCP_URL", "https://superset.example/mcp")
    monkeypatch.setenv("SUPERSET_DEFAULT_DATASET", "sales")
    monkeypatch.setenv("SUPERSET_MCP_API_KEY", " test-mcp-key ")

    settings = AgentSettings.from_env()

    assert settings.superset_mcp_url == "https://superset.example/mcp"
    assert settings.superset_default_dataset == "sales"
    assert settings.superset_mcp_api_key is not None
    assert settings.superset_mcp_api_key.get_secret_value() == "test-mcp-key"
