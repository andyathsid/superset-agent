"use client";

import { useCallback, useEffect, useState } from "react";
import type { McpServer } from "@/components/assistant-ui/elements/mcp-server-panel";

type McpStatusServer = Omit<McpServer, "checkedAt"> & {
  checked_at: string;
};

type McpStatusResponse = {
  servers: McpStatusServer[];
};

type UseMcpServerStatusOptions = {
  pollEnabled: boolean;
  intervalMs?: number;
};

const STATUS_URL = "/api/mcp-servers/status";
const DEFAULT_INTERVAL_MS = 30_000;

export function useMcpServerStatus({
  pollEnabled,
  intervalMs = DEFAULT_INTERVAL_MS,
}: UseMcpServerStatusOptions) {
  const [servers, setServers] = useState<readonly McpServer[]>([]);

  const refresh = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch(STATUS_URL, {
        cache: "no-store",
        signal,
      });

      if (!response.ok) {
        throw new Error(`MCP status request failed with ${response.status}.`);
      }

      const body: McpStatusResponse = await response.json();
      setServers(
        body.servers.map(({ checked_at, ...server }) => ({
          ...server,
          checkedAt: checked_at,
        })),
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      // Keep the last successful result when a refresh fails.
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);

    if (!pollEnabled) {
      return () => controller.abort();
    }

    const intervalId = window.setInterval(() => {
      void refresh(controller.signal);
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
      controller.abort();
    };
  }, [intervalMs, pollEnabled, refresh]);

  return { servers};
}
