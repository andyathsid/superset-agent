"use client";

import {
  AssistantRuntimeProvider,
  AuiConfig,
  Suggestions,
  type RemoteThreadListAdapter,
} from "@assistant-ui/react";

import { useStreamRuntime } from "@assistant-ui/react-langchain";
import { Client } from "@langchain/langgraph-sdk";
import { useMemo, useState } from "react";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { CloneThreadShell } from "@/components/assistant-ui/elements/clone-thread-shell";
import { McpServerPanel } from "@/components/assistant-ui/elements/mcp-server-panel";
import {
  ProviderSettingsPanel,
  type ModelConnection,
  type ProviderConnections,
} from "@/components/assistant-ui/elements/provider-settings-panel";
import { ModelSelector } from "@/components/assistant-ui/elements/model-selector.aui";
import { createLangGraphThreadListAdapter } from "@/app/lib/assistant/langgraph-thread-list-adapter";
import { sidebarCollapsedCookie } from "@/app/lib/cookies/definitions";
import { writeClientCookie } from "@/app/lib/cookies/client";
import { useMcpServerStatus } from "@/app/lib/assistant/use-mcp-server-status";
import {
  OpenRouterLogo,
  OllamaLogo,
  CustomProviderLogo,
} from "@/components/assistant-ui/elements/logos";

type AssistantProps = {
  defaultSidebarCollapsed: boolean;
};

const assistantConfig = AuiConfig({
  suggestions: Suggestions([
    {
      title: "Explore data",
      label: "Find relevant dashboards and metrics",
      prompt: "Help me explore the available data and dashboards.",
    },
    {
      title: "Analyze a metric",
      label: "Investigate a trend or anomaly",
      prompt: "Help me analyze a metric and identify notable trends.",
    },
    {
      title: "MCP servers",
      label: "Show what tools are available",
      prompt: "What MCP servers and tools are available to me?",
    },
  ]),
});

const PROVIDER_LABEL = {
  openrouter: "OpenRouter",
  ollama: "Ollama",
  custom: "Custom",
} as const;

const PROVIDER_ICON = {
  openrouter: <OpenRouterLogo className="size-4" />,
  ollama: <OllamaLogo className="size-4" />,
  custom: <CustomProviderLogo className="size-4" />,
} as const;

export function Assistant({ defaultSidebarCollapsed }: AssistantProps) {
  const apiUrl =
    process.env.NEXT_PUBLIC_LANGGRAPH_API_URL ||
    (typeof window !== "undefined" ? new URL("/api", window.location.href).href : undefined);

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
  const { servers: mcpServers } = useMcpServerStatus({
    pollEnabled: isMcpPanelOpen,
  });
  const [connections, setConnections] = useState<ProviderConnections>({
    ollama: {
      provider: "ollama",
      endpoint: "http://127.0.0.1:11434",
      model: "LiquidAI/lfm2.5-2.6b:q4_k_m",
      apiKey: "",
    },
    openrouter: {
      provider: "openrouter",
      endpoint: "https://openrouter.ai/api/v1",
      model: "liquid/lfm-2.5-2.6b:free",
      apiKey: "",
    },
    custom: {
      provider: "custom",
      endpoint: "",
      model: "",
      apiKey: "",
    },
  });

  const [selectedProvider, setSelectedProvider] = useState<ModelConnection["provider"]>("ollama");

  const modelOptions = Object.values(connections)
    .filter((connection) => connection.model.trim())
    .map((connection) => ({
      id: connection.provider,
      name: connection.model,
      description: PROVIDER_LABEL[connection.provider],
      icon: PROVIDER_ICON[connection.provider],
      keywords: [connection.provider, connection.model],
    }));
  return (
    <AssistantRuntimeProvider runtime={runtime} config={assistantConfig}>
      <CloneThreadShell
        defaultCollapsed={defaultSidebarCollapsed}
        onCollapsedChange={(collapsed) => {
          writeClientCookie(sidebarCollapsedCookie, collapsed);
        }}
        sidebarContent={
          <>
            <McpServerPanel
              servers={mcpServers}
              expandedId={expandedServerId}
              open={isMcpPanelOpen}
              onOpenChange={setMcpPanelOpen}
              onToggle={(id) => setExpandedServerId((current) => (current === id ? undefined : id))}
            />
          </>
        }
      >
        <Thread
          composerActions={
            <ModelSelector
              variant="ghost"
              size="sm"
              models={modelOptions}
              value={selectedProvider}
              onValueChange={(provider) =>
                setSelectedProvider(provider as ModelConnection["provider"])
              }
              footer={
                <ProviderSettingsPanel
                  connections={connections}
                  onConnectionsChange={setConnections}
                />
              }
            />
          }
        />
      </CloneThreadShell>
    </AssistantRuntimeProvider>
  );
}
