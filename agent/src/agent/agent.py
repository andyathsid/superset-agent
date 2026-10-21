"""Aegra-compatible LangChain agent with Apache Superset MCP tools."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel
from langchain_openrouter import ChatOpenRouter
from langgraph_sdk.runtime import ServerRuntime

from agent.config import AgentContext, AgentSettings
from agent.prompts import SYSTEM_PROMPT
from agent.tools import create_tools


def create_chat_model(settings: AgentSettings) -> BaseChatModel:
    """Create a model through the OpenAI Chat Completions-compatible API."""
    return ChatOpenRouter(
        model=settings.model_name,
        api_key=settings.model_api_key,
        base_url=settings.model_base_url,
        temperature=0,
    )


def build_agent(settings: AgentSettings, tools: list[Any]) -> Any:
    """Build the agent graph with the configured model and tools."""
    return create_agent(
        model=create_chat_model(settings),
        tools=tools,
        system_prompt=SYSTEM_PROMPT,
        name="build_agent",
        context_schema=AgentContext,
    )


@asynccontextmanager
async def graph(
    runtime: ServerRuntime[AgentContext],
) -> AsyncGenerator[Any, None]:
    """Create Aegra's graph and manage MCP connections during execution."""
    execution_runtime = runtime.execution_runtime
    settings = AgentSettings.from_env(
        execution_runtime.context if execution_runtime else None
    )

    if execution_runtime is None:
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
