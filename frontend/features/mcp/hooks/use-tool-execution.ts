"use client";

import { useEffect, useRef, useState } from "react";
import type { McpToolExecutionResponse } from "../types/tool-execution";

function isExecutionResponse(body: unknown): body is McpToolExecutionResponse {
  if (!body || typeof body !== "object") return false;
  const value = body as Record<string, unknown>;
  return (
    typeof value.server_id === "string" &&
    typeof value.tool_name === "string" &&
    typeof value.duration_ms === "number" &&
    typeof value.is_error === "boolean" &&
    Array.isArray(value.content) &&
    value.content.every(
      (block: unknown) => block !== null && typeof block === "object" && !Array.isArray(block),
    ) &&
    (value.structured_content === null ||
      (value.structured_content !== null &&
        typeof value.structured_content === "object" &&
        !Array.isArray(value.structured_content)))
  );
}

function executionError(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const payload = body as Record<string, unknown>;
    if (typeof payload.message === "string") return payload.message;
    if (typeof payload.error === "string") return payload.error;
    if (typeof payload.detail === "string") return payload.detail;
    if (
      payload.detail &&
      typeof payload.detail === "object" &&
      "message" in payload.detail &&
      typeof payload.detail.message === "string"
    )
      return payload.detail.message;
    if (Array.isArray(payload.detail)) {
      const messages = payload.detail.flatMap((item: unknown) =>
        item && typeof item === "object" && "msg" in item && typeof item.msg === "string"
          ? [item.msg]
          : [],
      );
      if (messages.length) return messages.join(" ");
    }
  }
  return `Tool request failed (${status}).`;
}

export function useToolExecution(serverId: string, toolName?: string) {
  const controller = useRef<AbortController | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<McpToolExecutionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  async function execute(arguments_: Record<string, unknown>) {
    if (!toolName || controller.current) return;
    const requestController = new AbortController();
    controller.current = requestController;
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const response = await fetch(
        `/api/mcp-servers/${encodeURIComponent(serverId)}/tools/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool_name: toolName, arguments: arguments_ }),
          signal: requestController.signal,
        },
      );
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(executionError(body, response.status));
      if (!isExecutionResponse(body)) throw new SyntaxError("Invalid tool response.");
      if (!requestController.signal.aborted) setResult(body);
    } catch (cause) {
      if (!requestController.signal.aborted)
        setError(
          cause instanceof TypeError || cause instanceof SyntaxError
            ? "Could not read the tool response. The tool may have executed. Check before running again."
            : cause instanceof Error
              ? cause.message
              : "The tool request failed.",
        );
    } finally {
      if (!requestController.signal.aborted) setRunning(false);
      if (controller.current === requestController) controller.current = null;
    }
  }

  function reset() {
    setResult(null);
    setError(null);
  }
  return { running, result, error, execute, reset };
}
