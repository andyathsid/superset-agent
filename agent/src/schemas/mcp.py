from datetime import datetime
from typing import Literal

from pydantic import BaseModel

McpConnectionStatus = Literal["connected", "needs-auth", "failed"]


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
