"""Environment-backed application configuration."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, SecretStr


@dataclass(frozen=True, slots=True)
class McpServerConfig:
    id: Literal["superset", "openmetadata"]
    name: str
    url: str
    token: SecretStr | None = None


class AgentContext(BaseModel):
    """Model configuration supplied for one graph execution."""

    model_config = ConfigDict(extra="ignore", frozen=True)

    model_name: str | None = None
    model_base_url: str | None = None
    model_api_key: str | None = None
    model_provider: (
        Literal["openai", "openrouter", "anthropic", "ollama", "custom"] | None
    ) = None
    model_selection_id: str | None = None
    model_display_name: str | None = None


@dataclass(frozen=True, slots=True)
class AgentSettings:
    model_name: str
    model_base_url: str
    model_api_key: SecretStr
    superset_mcp_url: str
    superset_mcp_api_key: SecretStr | None
    superset_default_dataset: str
    model_provider: str = "openrouter"
    model_selection_id: str = "default"
    model_display_name: str = "Default Model"
    openmetadata_mcp_url: str | None = None
    openmetadata_token: SecretStr | None = None

    def mcp_servers(self) -> tuple[McpServerConfig, ...]:
        """Return the configured servers without unwrapping their credentials."""
        servers = [
            McpServerConfig(
                "superset", "Superset", self.superset_mcp_url, self.superset_mcp_api_key
            )
        ]
        if self.openmetadata_mcp_url:
            servers.append(
                McpServerConfig(
                    "openmetadata",
                    "OpenMetadata",
                    self.openmetadata_mcp_url,
                    self.openmetadata_token,
                )
            )
        return tuple(servers)

    @classmethod
    def from_env(cls, context: AgentContext | None = None) -> AgentSettings:
        """Load environment defaults with optional per-run model overrides."""

        def model_value(override: str | None, env_name: str) -> str:
            raw_value = os.getenv(env_name, "") if override is None else override
            return raw_value.strip()

        model_name = model_value(
            context.model_name if context else None,
            "MODEL_NAME",
        )
        model_base_url = model_value(
            context.model_base_url if context else None,
            "MODEL_BASE_URL",
        ).rstrip("/")
        model_api_key = model_value(
            context.model_api_key if context else None,
            "MODEL_API_KEY",
        )
        model_provider = (
            model_value(context.model_provider if context else None, "MODEL_PROVIDER")
            or "openrouter"
        )
        if model_provider not in {
            "openai",
            "openrouter",
            "anthropic",
            "ollama",
            "custom",
        }:
            raise RuntimeError("Unsupported model provider.")

        if not model_name:
            raise RuntimeError("Set MODEL_NAME or select a model.")
        if not model_base_url:
            raise RuntimeError("Set MODEL_BASE_URL or configure a provider endpoint.")

        parsed_url = urlsplit(model_base_url)
        if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
            raise RuntimeError("MODEL_BASE_URL must be a valid HTTP(S) URL.")

        # Local OpenAI-compatible servers often require no authentication.
        # An explicitly empty runtime key gets a harmless placeholder.
        if not model_api_key:
            runtime_key_was_supplied = (
                context is not None and context.model_api_key is not None
            )
            if not runtime_key_was_supplied:
                raise RuntimeError("Set MODEL_API_KEY.")

            model_api_key = "not-required"

        mcp_api_key = os.getenv("SUPERSET_MCP_API_KEY", "").strip()
        openmetadata_url = os.getenv("OPENMETADATA_MCP_URL", "").strip()
        openmetadata_token = os.getenv("OPENMETADATA_TOKEN", "").strip()
        if bool(openmetadata_url) != bool(openmetadata_token):
            raise RuntimeError(
                "Set OPENMETADATA_MCP_URL and OPENMETADATA_TOKEN together."
            )
        if openmetadata_url:
            parsed_openmetadata_url = urlsplit(openmetadata_url)
            if (
                parsed_openmetadata_url.scheme not in {"http", "https"}
                or not parsed_openmetadata_url.netloc
            ):
                raise RuntimeError("OPENMETADATA_MCP_URL must be a valid HTTP(S) URL.")

        return cls(
            model_name=model_name,
            model_base_url=model_base_url,
            model_api_key=SecretStr(model_api_key),
            model_provider=model_provider,
            model_selection_id=(context.model_selection_id if context else None)
            or "default",
            model_display_name=(context.model_display_name if context else None)
            or "Default Model",
            superset_mcp_url=os.getenv(
                "SUPERSET_MCP_URL",
                "http://localhost:5008/mcp",
            ).strip(),
            superset_default_dataset=os.getenv(
                "SUPERSET_DEFAULT_DATASET",
                "wb_health_population",
            ).strip(),
            superset_mcp_api_key=(SecretStr(mcp_api_key) if mcp_api_key else None),
            openmetadata_mcp_url=openmetadata_url or None,
            openmetadata_token=(
                SecretStr(openmetadata_token) if openmetadata_token else None
            ),
        )
