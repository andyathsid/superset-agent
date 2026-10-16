"""Environment-backed application configuration."""

from __future__ import annotations

import os
from dataclasses import dataclass

from pydantic import SecretStr

SUPPORTED_PROVIDERS = {"ollama", "openrouter"}


@dataclass(frozen=True, slots=True)
class AgentSettings:
    provider: str
    openrouter_api_key: SecretStr | None
    openrouter_base_url: str
    openrouter_model: str
    ollama_model: str
    ollama_base_url: str
    ollama_num_ctx: int
    superset_mcp_url: str
    superset_mcp_api_key: SecretStr | None
    superset_default_dataset: str

    @classmethod
    def from_env(cls) -> AgentSettings:
        provider = os.getenv("PROVIDER", "ollama").strip().lower()
        if provider not in SUPPORTED_PROVIDERS:
            choices = ", ".join(sorted(SUPPORTED_PROVIDERS))
            raise RuntimeError(f"PROVIDER must be one of: {choices}.")

        api_key = os.getenv("OPENROUTER_API_KEY", "")
        if provider == "openrouter" and not api_key:
            raise RuntimeError("Set OPENROUTER_API_KEY when PROVIDER=openrouter.")

        try:
            ollama_num_ctx = int(os.getenv("OLLAMA_NUM_CTX", "32768"))
        except ValueError as error:
            raise RuntimeError("OLLAMA_NUM_CTX must be an integer.") from error
        if ollama_num_ctx <= 0:
            raise RuntimeError("OLLAMA_NUM_CTX must be greater than zero.")

        mcp_api_key = os.getenv("SUPERSET_MCP_API_KEY", "")
        return cls(
            provider=provider,
            openrouter_api_key=SecretStr(api_key) if api_key else None,
            openrouter_base_url=os.getenv(
                "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
            ).rstrip("/"),
            openrouter_model=os.getenv("OPENROUTER_MODEL", "liquid/lfm-2.5-2.6b:free"),
            ollama_model=os.getenv("OLLAMA_MODEL", "LiquidAI/lfm2.5-2.6b:q4_k_m"),
            ollama_base_url=os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip(
                "/"
            ),
            ollama_num_ctx=ollama_num_ctx,
            superset_mcp_url=os.getenv("SUPERSET_MCP_URL", "http://localhost:5008/mcp"),
            superset_default_dataset=os.getenv(
                "SUPERSET_DEFAULT_DATASET", "wb_health_population"
            ),
            superset_mcp_api_key=SecretStr(mcp_api_key) if mcp_api_key else None,
        )
