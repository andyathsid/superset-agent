"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import {
  assistantModels,
  defaultModelId,
  type AssistantModel,
  type ModelConnection,
  type ProviderApiKeys,
} from "../config/models";
import { resolveRunModel, type RunModel } from "../runtime/model-config";

function useModelStore() {
  const [allModels, setAllModels] = useState<AssistantModel[]>(() => [...assistantModels]);
  const [selectedModel, setSelectedModel] = useState(defaultModelId);
  // Credentials stay in memory, separate from the model metadata rendered by cmdk.
  const connectionsRef = useRef(new Map<string, ModelConnection>());
  const [providerApiKeys, setProviderApiKeys] = useState<ProviderApiKeys>({});
  const [customApiKeys, setCustomApiKeys] = useState<Record<string, string>>({});
  function getApiKey(model: AssistantModel) {
    return model.provider === "custom"
      ? customApiKeys[model.id]
      : model.provider === "ollama"
        ? undefined
        : providerApiKeys[model.provider];
  }
  const snapshotRef = useRef<() => ReturnType<typeof resolveRunModel>>(() => {
    throw new Error("Model store is not ready.");
  });
  const prepareRunRef = useRef<
    | ((threadId: string, request: Record<string, unknown>, model: RunModel) => Promise<void>)
    | undefined
  >(undefined);
  snapshotRef.current = () =>
    resolveRunModel(selectedModel, allModels, connectionsRef.current, getApiKey);
  return {
    allModels,
    setAllModels,
    selectedModel,
    setSelectedModel,
    connectionsRef,
    providerApiKeys,
    setProviderApiKeys,
    customApiKeys,
    setCustomApiKeys,
    getApiKey,
    snapshotRef,
    prepareRunRef,
  };
}

const ModelContext = createContext<ReturnType<typeof useModelStore> | null>(null);

export function ModelProvider({ children }: { children: ReactNode }) {
  const store = useModelStore();
  return <ModelContext.Provider value={store}>{children}</ModelContext.Provider>;
}

export function useModels() {
  const store = useContext(ModelContext);
  if (!store) throw new Error("ModelProvider is required.");
  return store;
}
