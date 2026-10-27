"""Execute catalog tools directly, without an agent or model invocation."""

from __future__ import annotations

import asyncio
from time import monotonic
from typing import Literal

import httpx2
from fastmcp import Client as FastMCPClient
from fastmcp.client.transports import StreamableHttpTransport
from jsonschema.exceptions import SchemaError, ValidationError
from jsonschema.validators import validator_for
from mcp.shared.exceptions import MCPError
from mcp.types import REQUEST_TIMEOUT
from referencing import Registry
from referencing.exceptions import Unresolvable

from agent.config import McpServerConfig
from agent.mcp.catalog import CatalogError, tool_catalog_cache
from agent.mcp.transport import http_client_factory
from schemas.mcp import McpToolExecutionRequest, McpToolExecutionResponse

EXECUTION_TIMEOUT_SECONDS = 30.0
ExecutionErrorCode = Literal[
    "mcp_tool_not_found",
    "mcp_invalid_arguments",
    "mcp_schema_unavailable",
    "mcp_dispatcher_unavailable",
    "mcp_auth_failed",
    "mcp_timeout",
    "mcp_execution_unavailable",
]
_ERROR_DETAILS: dict[ExecutionErrorCode, tuple[int, str]] = {
    "mcp_tool_not_found": (404, "The tool is not available in this server's catalog."),
    "mcp_invalid_arguments": (422, "Arguments do not match the tool's input schema."),
    "mcp_schema_unavailable": (
        502,
        "The tool's input schema is unavailable or invalid.",
    ),
    "mcp_dispatcher_unavailable": (502, "The MCP tool dispatcher is unavailable."),
    "mcp_auth_failed": (502, "Authentication to the MCP server failed."),
    "mcp_timeout": (
        504,
        "The MCP server did not respond in time. The tool may have executed.",
    ),
    "mcp_execution_unavailable": (502, "The MCP tool could not be executed."),
}


class ExecutionError(Exception):
    def __init__(self, code: ExecutionErrorCode) -> None:
        self.code = code
        self.status_code, self.message = _ERROR_DETAILS[code]
        super().__init__(self.message)


def _normalize_error(error: Exception) -> ExecutionError:
    pending: list[BaseException] = [error]
    seen: set[int] = set()
    timed_out = False
    while pending:
        current = pending.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        if isinstance(
            current, httpx2.HTTPStatusError
        ) and current.response.status_code in {401, 403}:
            return ExecutionError("mcp_auth_failed")
        if isinstance(current, (TimeoutError, httpx2.TimeoutException)):
            timed_out = True
        if isinstance(current, MCPError) and current.code == REQUEST_TIMEOUT:
            timed_out = True
        if isinstance(current, BaseExceptionGroup):
            pending.extend(current.exceptions)
        cause = current.__cause__ or current.__context__
        if cause is not None:
            pending.append(cause)
    return ExecutionError("mcp_timeout" if timed_out else "mcp_execution_unavailable")


async def execute_tool(
    server: McpServerConfig, request: McpToolExecutionRequest
) -> McpToolExecutionResponse:
    """Resolve names and dispatch using trusted catalog metadata only."""
    started_at = monotonic()
    try:
        # Bound discovery, connection setup, execution, and cleanup together.
        async with asyncio.timeout(EXECUTION_TIMEOUT_SECONDS):
            token = server.token.get_secret_value() if server.token else None
            catalog = await tool_catalog_cache.get(
                server.url, token, server_id=server.id
            )
            tool = next(
                (item for item in catalog.tools if item.name == request.tool_name), None
            )
            if tool is None:
                raise ExecutionError("mcp_tool_not_found")
            if server.id == "superset" and tool.raw_name == "call_tool":
                # Raw dispatcher calls would bypass validation of the target schema.
                raise ExecutionError("mcp_tool_not_found")

            if tool.input_schema is None:
                raise ExecutionError("mcp_schema_unavailable")
            try:
                validator_class = validator_for(tool.input_schema)
                validator_class.check_schema(tool.input_schema)
                # Local $refs work; never fetch remote schemas during a request.
                validator = validator_class(tool.input_schema, registry=Registry())
                validator.validate(request.arguments)
            except ValidationError:
                raise ExecutionError("mcp_invalid_arguments") from None
            except (SchemaError, Unresolvable):
                raise ExecutionError("mcp_schema_unavailable") from None

            name = tool.raw_name
            arguments = request.arguments
            if server.id == "superset" and tool.source == "discovered":
                if not any(
                    item.source == "base" and item.raw_name == "call_tool"
                    for item in catalog.tools
                ):
                    raise ExecutionError("mcp_dispatcher_unavailable")
                name = "call_tool"
                arguments = {"name": tool.raw_name, "arguments": request.arguments}
            elif tool.source != "base":
                raise ExecutionError("mcp_dispatcher_unavailable")

            client = FastMCPClient(
                StreamableHttpTransport(
                    server.url,
                    auth=token,
                    httpx_client_factory=http_client_factory,
                )
            )
            async with client:
                result = await client.call_tool_mcp(
                    name, arguments, timeout=EXECUTION_TIMEOUT_SECONDS
                )

            payload = result.model_dump(mode="json", by_alias=True)
            return McpToolExecutionResponse.model_validate(
                {
                    "server_id": server.id,
                    "tool_name": tool.name,
                    "duration_ms": round((monotonic() - started_at) * 1000),
                    "is_error": result.is_error,
                    "content": payload["content"],
                    "structured_content": payload.get("structuredContent"),
                }
            )
    except (CatalogError, ExecutionError):
        raise
    except Exception as error:  # noqa: BLE001 - Transport errors may contain credentials.
        raise _normalize_error(error) from None
