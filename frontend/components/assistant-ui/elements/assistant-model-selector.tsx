"use client";

import { useEffect, useState } from "react";
import { useAui, useAuiState } from "@assistant-ui/react";
import { ModelSelector } from "./model-selector.aui";
import {
  ProviderSettingsPanel,
  type ModelConnection,
  type ProviderConnections,
} from "./provider-settings-panel";
import {
  CustomProviderLogo,
  OllamaLogo,
  OpenRouterLogo,
} from "./logos";

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

const DEFAULT_CONNECTIONS: ProviderConnections = {
  ollama: {
    provider: "ollama",
    endpoint: "http://127.0.0.1:11434/v1",
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
};

function ModelRunConfigSync({
  connection,
}: {
  connection: ModelConnection;
}) {
  const aui = useAui();
  const threadId = useAuiState((state) => state.threadListItem.id);
  const isThreadReady = useAuiState((state) => !state.thread.isLoading);

  useEffect(() => {
    if (!isThreadReady) return;

    aui.composer.setRunConfig({
      custom: {
        model_name: connection.model.trim(),
        model_base_url: connection.endpoint.trim().replace(/\/+$/, ""),
        model_api_key: connection.apiKey.trim(),
      },
    });
  }, [
    aui,
    threadId,
    isThreadReady,
    connection.model,
    connection.endpoint,
    connection.apiKey,
  ]);

  return null;
}

export function AssistantModelSelector() {
  const [connections, setConnections] =
    useState<ProviderConnections>(DEFAULT_CONNECTIONS);

  const [selectedProvider, setSelectedProvider] =
    useState<ModelConnection["provider"]>("ollama");

  const selectedConnection = connections[selectedProvider];

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
    <>
      <ModelRunConfigSync connection={selectedConnection} />

      <ModelSelector
        variant="ghost"
        size="sm"
        models={modelOptions}
        value={selectedProvider}
        onValueChange={(provider) => {
          setSelectedProvider(provider as ModelConnection["provider"]);
        }}
        footer={
          <ProviderSettingsPanel
            connections={connections}
            onConnectionsChange={setConnections}
          />
        }
      />
    </>
  );
}
