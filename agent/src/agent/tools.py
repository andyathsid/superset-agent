from langchain.mcp import MCPAdapter

from langchain_core.tools import BaseTool

async def create_tools(superset_mcp_url: str) -> list[BaseTool]:
    async with MCPAdapter(superset_mcp_url) as adapter:
        return await adapter.list_tools()
