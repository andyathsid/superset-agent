"""Aegra-compatible LangChain agent with Apache Superset MCP tools."""

from __future__ import annotations

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_openrouter import ChatOpenRouter

from agent.config import AgentSettings
from agent.prompts import SYSTEM_PROMPT
from agent.tools import create_tools


async def build_agent(settings: AgentSettings):
    """Discover Superset tools and build the compiled agent graph."""
    model = ChatOpenRouter(
        model=settings.llm_model,
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
        temperature=0,
    )

    tools = await create_tools(settings.superset_mcp_url)

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
