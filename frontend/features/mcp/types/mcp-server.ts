export type McpServerStatus = "connected" | "connecting" | "needs-auth" | "failed";

export interface McpServer {
  id: string;
  name: string;
  transport: string;
  url: string;
  status: McpServerStatus;
  tools: readonly string[];
  checkedAt?: string;
}
