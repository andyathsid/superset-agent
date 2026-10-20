"use client";

import {
  AssistantRuntimeProvider,
  type RemoteThreadListAdapter,
} from "@assistant-ui/react";
import { useStreamRuntime } from "@assistant-ui/react-langchain";
import { Client } from "@langchain/langgraph-sdk";
import { useMemo, useState } from "react";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { CloneThreadShell } from "@/components/assistant-ui/elements/clone-thread-shell";
import {
  McpServerPanel,
  type McpServer,
} from "@/components/assistant-ui/elements/mcp-server-panel";
import { createLangGraphThreadListAdapter } from "@/app/lib/assistant/langgraph-thread-list-adapter";
import { sidebarCollapsedCookie } from "@/app/lib/cookies/definitions";
import { writeClientCookie } from "@/app/lib/cookies/client";

type AssistantProps = {
  defaultSidebarCollapsed: boolean;
};

const mcpServers: readonly McpServer[] = [
  {
    id: "superset",
    name: "Superset",
    transport: "HTTP",
    status: "connected",
    tools: [
      "query_sql",
      "list_datasets",
      ...Array.from(
        { length: 50 },
        (_, index) => `dummy_tool_${String(index + 1).padStart(2, "0")}`,
      ),
    ],
  },
  {
    id: "analytics",
    name: "Analytics",
    transport: "HTTP",
    status: "connecting",
    tools: ["search_metrics"],
  },
];

export function Assistant({ defaultSidebarCollapsed }: AssistantProps) {
  const apiUrl =
    process.env.NEXT_PUBLIC_LANGGRAPH_API_URL ||
    (typeof window !== "undefined"
      ? new URL("/api", window.location.href).href
      : undefined);

  const client = useMemo(() => new Client({ apiUrl }), [apiUrl]);

  const threadListAdapter = useMemo<RemoteThreadListAdapter>(
    () => createLangGraphThreadListAdapter(client),
    [client],
  );

  const runtime = useStreamRuntime({
    assistantId: process.env.NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID!,
    apiUrl,
    unstable_threadListAdapter: threadListAdapter,
  });

  const [expandedServerId, setExpandedServerId] = useState<string>();

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <CloneThreadShell
        defaultCollapsed={defaultSidebarCollapsed}
        onCollapsedChange={(collapsed) => {
          writeClientCookie(sidebarCollapsedCookie, collapsed);
        }}
        sidebarContent={
          <McpServerPanel
            servers={mcpServers}
            expandedId={expandedServerId}
            onToggle={(id) =>
              setExpandedServerId((current) =>
                current === id ? undefined : id,
              )
            }
          />
        }
      >
        <Thread />
      </CloneThreadShell>
    </AssistantRuntimeProvider>
  );
}
