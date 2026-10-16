from fastmcp import Client as FastMCPClient
from langchain.mcp import MCPAdapter
from langchain_core.tools import BaseTool


async def create_tools(
    superset_mcp_url: str,
    superset_mcp_api_key: str | None = None,
) -> list[BaseTool]:
    client = (
        FastMCPClient(superset_mcp_url, auth=superset_mcp_api_key)
        if superset_mcp_api_key
        else superset_mcp_url
    )

    async with MCPAdapter(client) as adapter:
        return await adapter.list_tools()
