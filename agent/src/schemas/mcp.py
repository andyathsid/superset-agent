from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue

McpConnectionStatus = Literal["connected", "needs-auth", "failed"]
McpServerId = Literal["superset", "openmetadata"]


class McpServerStatus(BaseModel):
    id: str
    name: str
    transport: str
    url: str
    status: McpConnectionStatus
    tools: list[str]
    checked_at: datetime


class McpServerStatusResponse(BaseModel):
    checked_at: datetime
    servers: list[McpServerStatus]


class McpToolCatalogItem(BaseModel):
    model_config = ConfigDict(strict=True)

    name: str = Field(min_length=1, pattern=r"\S")
    raw_name: str = Field(min_length=1, pattern=r"\S")
    description: str
    category: str
    source: Literal["base", "discovered"]
    input_schema: dict[str, JsonValue] | None


class McpToolCatalogResponse(BaseModel):
    server_id: McpServerId = "superset"
    fetched_at: datetime
    tools: list[McpToolCatalogItem]


class McpToolExecutionRequest(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    tool_name: str = Field(min_length=1, pattern=r"\S")
    arguments: dict[str, JsonValue] = Field(default_factory=dict)


class McpToolExecutionResponse(BaseModel):
    server_id: McpServerId
    tool_name: str
    duration_ms: int = Field(ge=0)
    is_error: bool
    content: list[dict[str, JsonValue]]
    structured_content: dict[str, JsonValue] | None = None
