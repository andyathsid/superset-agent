export type McpToolExecutionResponse = {
  server_id: string;
  tool_name: string;
  duration_ms: number;
  is_error: boolean;
  content: Record<string, unknown>[];
  structured_content: Record<string, unknown> | null;
};
