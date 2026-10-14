"""Environment-backed application configuration."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pydantic import SecretStr


@dataclass(frozen=True, slots=True)
class AgentSettings:
    openrouter_api_key: SecretStr
    openrouter_base_url: str
    llm_model: str
    superset_mcp_url: str
    superset_default_dataset: str

    @classmethod
    def from_env(cls) -> AgentSettings:
        api_key = os.getenv("OPENROUTER_API_KEY", "")
        if not api_key:
            raise RuntimeError("Set OPENROUTER_API_KEY before loading the agent graph.")
        return cls(
            openrouter_api_key=SecretStr(api_key),
            openrouter_base_url=os.getenv(
                "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
            ),
            llm_model=os.getenv("LLM_MODEL", "poolside/laguna-s-2.1:free"),
            superset_mcp_url=os.getenv(
                "SUPERSET_MCP_URL", "http://localhost:5008/mcp"
            ),
            superset_default_dataset=os.getenv(
                "SUPERSET_DEFAULT_DATASET", "wb_health_population"
            ),
        )
