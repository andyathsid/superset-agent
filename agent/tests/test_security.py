"""Direct MCP integration tests for Superset security controls."""

from __future__ import annotations

import json
import os

import pytest
from dotenv import load_dotenv
from fastmcp import Client
from mcp_types import TextContent

load_dotenv()

_e2e = pytest.mark.skipif(
    os.getenv("E2E") != "1",
    reason="Set E2E=1 to run Superset security integration tests.",
)


@_e2e
@pytest.mark.asyncio
async def test_sales_na_can_only_list_its_allowed_datasets() -> None:
    """Cover the dataset_subset_listing case using native Superset RBAC."""
    api_key = os.getenv("SUPERSET_MCP_API_KEY_SALES_NA", "")
    if not api_key or api_key == "sst_...":
        pytest.fail(
            "Replace SUPERSET_MCP_API_KEY_SALES_NA with a real API key owned "
            "by the mcp_sales_na Superset user."
        )

    mcp_url = os.getenv("SUPERSET_MCP_URL", "http://localhost:5008/mcp")
    async with Client(mcp_url, auth=api_key) as client:
        result = await client.call_tool(
            "list_datasets",
            {"request": {"page_size": 100}},
        )

    content = result.content[0]
    assert isinstance(content, TextContent)
    payload = json.loads(content.text)
    visible_datasets = {
        (dataset["schema"], dataset["table_name"])
        for dataset in payload["datasets"]
    }

    assert {
        ("mcp_test_public", "regions"),
        ("mcp_test_sales", "products"),
        ("mcp_test_sales", "customers"),
        ("mcp_test_sales", "orders"),
        ("mcp_test_support", "tickets"),
    } <= visible_datasets
    assert ("mcp_test_finance", "payroll") not in visible_datasets
    assert ("mcp_test_security", "access_audit") not in visible_datasets
