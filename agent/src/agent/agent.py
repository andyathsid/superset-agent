"""Aegra-compatible LangChain agent with Apache Superset MCP tools."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain.agents.middleware import AgentMiddleware, AgentState
from langchain.messages import AIMessage
from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI
from langchain_openrouter import ChatOpenRouter
from langgraph.runtime import Runtime
from langgraph_sdk.runtime import ServerRuntime

from agent.config import AgentContext, AgentSettings
from agent.prompts import SYSTEM_PROMPT
from agent.tools import create_tools


def create_chat_model(settings: AgentSettings) -> BaseChatModel:
    """Create the provider adapter selected for this graph execution."""
    if settings.model_provider == "anthropic":
        return ChatAnthropic(
            model_name=settings.model_name,
            api_key=settings.model_api_key,
            base_url=settings.model_base_url,
            temperature=0,
            max_tokens_to_sample=4096,
            timeout=None,
            stop=None,
        )
    if settings.model_provider == "openai":
        return ChatOpenAI(
            model=settings.model_name,
            api_key=settings.model_api_key,
            base_url=settings.model_base_url,
        )
    if settings.model_provider != "openrouter":
        return ChatOpenAI(
            model=settings.model_name,
            api_key=settings.model_api_key,
            base_url=settings.model_base_url,
            temperature=0,
        )
    
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
        middleware=[ModelMetadataMiddleware(settings)],
    )


class ModelMetadataMiddleware(AgentMiddleware[AgentState, AgentContext]):
    """Persist model identity on each response without storing credentials."""

    def __init__(self, settings: AgentSettings) -> None:
        self.identity = {
            "id": settings.model_selection_id,
            "name": settings.model_display_name,
            "provider": settings.model_provider,
            "modelId": settings.model_name,
        }

    def after_model(
        self, state: AgentState, runtime: Runtime[AgentContext]
    ) -> dict[str, Any] | None:
        message = state["messages"][-1]
        if not isinstance(message, AIMessage):
            return None
        kwargs = dict(message.additional_kwargs)
        kwargs["metadata"] = {**kwargs.get("metadata", {}), "ui_model": self.identity}
        return {"messages": [message.model_copy(update={"additional_kwargs": kwargs})]}

    async def aafter_model(
        self, state: AgentState, runtime: Runtime[AgentContext]
    ) -> dict[str, Any] | None:
        return self.after_model(state, runtime)


@asynccontextmanager
async def graph(
    runtime: ServerRuntime[AgentContext],
) -> AsyncGenerator[Any, None]:
    """Create Aegra's graph and manage MCP connections during execution."""
    execution_runtime = runtime.execution_runtime
    # State/history requests compile the graph without executing its model.
    # Their context has no per-run credentials, so use an inert model adapter.
    context = (
        execution_runtime.context
        if execution_runtime
        else AgentContext(
            model_name="checkpoint-reader",
            model_provider="openai",
            model_base_url="http://localhost",
            model_api_key="",
        )
    )
    settings = AgentSettings.from_env(context)

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
