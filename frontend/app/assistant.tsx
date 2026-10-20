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
import { McpServerPanel } from "@/components/assistant-ui/elements/mcp-server-panel";
import { createLangGraphThreadListAdapter } from "@/app/lib/assistant/langgraph-thread-list-adapter";
import { sidebarCollapsedCookie } from "@/app/lib/cookies/definitions";
import { writeClientCookie } from "@/app/lib/cookies/client";
import { useMcpServerStatus } from "@/app/lib/assistant/use-mcp-server-status";

type AssistantProps = {
  defaultSidebarCollapsed: boolean;
};

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
  const [isMcpPanelOpen, setMcpPanelOpen] = useState(false);
  const { servers: mcpServers} = useMcpServerStatus({
    pollEnabled: isMcpPanelOpen,
  });
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
            open={isMcpPanelOpen}
            onOpenChange={setMcpPanelOpen}
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
