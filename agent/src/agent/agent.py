
"""Aegra-compatible LangChain agent with Apache Superset MCP tools."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel
from langchain_ollama import ChatOllama
from langchain_openrouter import ChatOpenRouter
from langgraph_sdk.runtime import ServerRuntime

from agent.config import AgentSettings
from agent.prompts import SYSTEM_PROMPT
from agent.tools import create_tools


def create_chat_model(settings: AgentSettings) -> BaseChatModel:
    """Create the chat model selected by the configured provider."""
    if settings.provider == "ollama":
        return ChatOllama(
            model=settings.ollama_model,
            base_url=settings.ollama_base_url,
            num_ctx=settings.ollama_num_ctx,
            temperature=0,
        )

    if settings.openrouter_api_key is None:
        raise RuntimeError("OPENROUTER_API_KEY is required for OpenRouter.")

    return ChatOpenRouter(
        model=settings.openrouter_model,
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
        temperature=0,
    )


def build_agent(settings: AgentSettings, tools: list[Any]) -> Any:
    """Build the agent graph with the configured model and tools."""
    return create_agent(
        model=create_chat_model(settings),
        tools=tools,
        system_prompt=SYSTEM_PROMPT,
        name="build_agent",
    )


@asynccontextmanager
async def graph(runtime: ServerRuntime) -> AsyncGenerator[Any, None]:
    """Create Aegra's graph and manage MCP connections during execution."""
    settings = AgentSettings.from_env()

    if runtime.execution_runtime is None:
        yield build_agent(settings, [])
        return

    async with create_tools(
        settings.superset_mcp_url,
        (
            settings.superset_mcp_api_key.get_secret_value()
            if settings.superset_mcp_api_key
            else None
        ),
    ) as tools:
        yield build_agent(settings, tools)


load_dotenv()
agent = graph
