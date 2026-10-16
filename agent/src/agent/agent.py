"""Aegra-compatible LangChain agent with Apache Superset MCP tools."""

from __future__ import annotations

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel
from langchain_ollama import ChatOllama
from langchain_openrouter import ChatOpenRouter

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


async def build_agent(settings: AgentSettings):
    """Discover Superset tools and build the compiled agent graph."""
    model = create_chat_model(settings)

    tools = await create_tools(
        settings.superset_mcp_url,
        (
            settings.superset_mcp_api_key.get_secret_value()
            if settings.superset_mcp_api_key
            else None
        ),
    )

    return create_agent(
        model=model,
        tools=tools,
        system_prompt=SYSTEM_PROMPT.format(
            default_dataset=settings.superset_default_dataset
        ),
        name="superset_agent",
    )


async def load_agent():
    """Load settings and create the graph for Aegra."""
    return await build_agent(AgentSettings.from_env())


load_dotenv()
agent = load_agent
