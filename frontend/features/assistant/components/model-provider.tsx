"use client";

import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Client } from "@langchain/langgraph-sdk";
import {
  assistantModels,
  type AssistantModel,
  type ModelConnection,
  type ProviderApiKeys,
} from "../config/models";
import { resolveRunModel, type RunModel } from "../runtime/model-config";
import { ThreadModelStore } from "../runtime/thread-model-store";

function useModelStore() {
  const [allModels, setAllModels] = useState<AssistantModel[]>(() => [...assistantModels]);
  const apiUrl =
    typeof window !== "undefined" ? new URL("/api", window.location.href).href : undefined;
  const client = useMemo(() => new Client({ apiUrl }), [apiUrl]);
  const threadModels = useMemo(() => new ThreadModelStore(client), [client]);
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
  const snapshotRef = useRef<(id: string) => RunModel>(() => {
    throw new Error("Model store is not ready.");
  });
  snapshotRef.current = (id) => resolveRunModel(id, allModels, connectionsRef.current, getApiKey);
  return {
    allModels,
    setAllModels,
    apiUrl,
    client,
    threadModels,
    connectionsRef,
    providerApiKeys,
    setProviderApiKeys,
    customApiKeys,
    setCustomApiKeys,
    getApiKey,
    snapshotRef,
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
