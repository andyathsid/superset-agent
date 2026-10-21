"use client";

import { useEffect, useState } from "react";
import { useAui, useAuiState } from "@assistant-ui/react";
import { ModelSelector } from "./model-selector.aui";
import { OPENROUTER_TESTING_MODEL } from "@/app/lib/assistant/model-config";
import {
  ProviderSettingsPanel,
  type ModelConnection,
  type ProviderConnections,
} from "./provider-settings-panel";
import { CustomProviderLogo, OllamaLogo, OpenRouterLogo } from "./logos";

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

const OPENROUTER_TESTING_CONNECTION = {
  provider: "openrouter",
  endpoint: OPENROUTER_TESTING_MODEL.baseUrl,
  model: OPENROUTER_TESTING_MODEL.name,
  apiKey: "",
} satisfies ModelConnection;

type ModelId = ModelConnection["provider"] | typeof OPENROUTER_TESTING_MODEL.id;

const DEFAULT_CONNECTIONS: ProviderConnections = {
  openrouter: {
    provider: "openrouter",
    endpoint: "https://openrouter.ai/api/v1",
    model: "liquid/lfm-2.5-2.6b:free",
    apiKey: "",
  },
  ollama: {
    provider: "ollama",
    endpoint: "http://host.docker.internal:11434/v1",
    model: "LiquidAI/lfm2.5-2.6b:q4_k_m",
    apiKey: "",
  },
  custom: {
    provider: "custom",
    endpoint: "",
    model: "",
    apiKey: "",
  },
};

function ModelRunConfigSync({ connection }: { connection: ModelConnection }) {
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

  const [selectedModelId, setSelectedModelId] = useState<ModelId>(
    OPENROUTER_TESTING_MODEL.id,
  );

  const selectedConnection =
    selectedModelId === OPENROUTER_TESTING_MODEL.id
      ? OPENROUTER_TESTING_CONNECTION
      : connections[selectedModelId];

  const modelOptions = [
    {
      id: OPENROUTER_TESTING_MODEL.id,
      name: OPENROUTER_TESTING_MODEL.name,
      description: OPENROUTER_TESTING_MODEL.providerLabel,
      icon: PROVIDER_ICON.openrouter,
      keywords: ["openrouter", "testing", OPENROUTER_TESTING_MODEL.name],
    },
    ...Object.values(connections)
      .filter((connection) => connection.model.trim())
      .map((connection) => ({
        id: connection.provider,
        name: connection.model,
        description: PROVIDER_LABEL[connection.provider],
        icon: PROVIDER_ICON[connection.provider],
        keywords: [connection.provider, connection.model],
      })),
  ];

  return (
    <>
      <ModelRunConfigSync connection={selectedConnection} />

      <ModelSelector
        variant="ghost"
        size="sm"
        models={modelOptions}
        value={selectedModelId}
        onValueChange={(modelId) => {
          setSelectedModelId(modelId as ModelId);
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
