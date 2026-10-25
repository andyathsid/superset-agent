import { createStore } from "zustand/vanilla";
import { Client } from "@langchain/langgraph-sdk";
import {
  assistantModels,
  type AssistantModel,
  type ModelConnection,
  type ProviderApiKeys,
  type SharedKeyProvider,
} from "../config/models";
import { resolveRunModel, type RunModel } from "./model-config";
import { createThreadModelStore, type ThreadModelStore } from "./thread-model-store";

export type ModelState = {
  allModels: AssistantModel[];
  connections: ReadonlyMap<string, ModelConnection>;
  providerApiKeys: ProviderApiKeys;
  customApiKeys: Record<string, string>;
  apiUrl: string | undefined;
  client: Client;
  threadModels: ThreadModelStore;
  addModel: (model: AssistantModel, connection: ModelConnection, apiKey: string) => void;
  updateModel: (id: string, changes: Pick<AssistantModel, "name" | "description">) => void;
  removeModel: (id: string) => void;
  setProviderApiKey: (provider: SharedKeyProvider, apiKey: string) => void;
  setCustomApiKey: (id: string, apiKey: string) => void;
  getApiKey: (model: AssistantModel) => string | undefined;
  snapshot: (id: string) => RunModel;
};

export function createModelStore(apiUrl?: string) {
  const client = new Client({ apiUrl });
  // Each provider owns its store. Credentials stay in memory for this session.
  return createStore<ModelState>()((set, get) => ({
    allModels: [...assistantModels],
    connections: new Map(),
    providerApiKeys: {},
    customApiKeys: {},
    apiUrl,
    client,
    threadModels: createThreadModelStore(client),
    addModel: (model, connection, apiKey) =>
      set((state) => ({
        allModels: [...state.allModels, model],
        connections: new Map(state.connections).set(model.id, connection),
        customApiKeys:
          model.provider === "custom"
            ? { ...state.customApiKeys, [model.id]: apiKey }
            : state.customApiKeys,
        providerApiKeys:
          model.provider !== "custom" && model.provider !== "ollama"
            ? { ...state.providerApiKeys, [model.provider]: apiKey }
            : state.providerApiKeys,
      })),
    updateModel: (id, changes) =>
      set((state) => ({
        allModels: state.allModels.map((model) =>
          model.id === id ? { ...model, ...changes } : model,
        ),
      })),
    removeModel: (id) =>
      set((state) => {
        const connections = new Map(state.connections);
        connections.delete(id);
        const customApiKeys = { ...state.customApiKeys };
        delete customApiKeys[id];
        return {
          allModels: state.allModels.filter((model) => model.id !== id),
          connections,
          customApiKeys,
        };
      }),
    setProviderApiKey: (provider, apiKey) =>
      set((state) => ({ providerApiKeys: { ...state.providerApiKeys, [provider]: apiKey } })),
    setCustomApiKey: (id, apiKey) =>
      set((state) => ({ customApiKeys: { ...state.customApiKeys, [id]: apiKey } })),
    getApiKey: (model) => {
      const state = get();
      return model.provider === "custom"
        ? state.customApiKeys[model.id]
        : model.provider === "ollama"
          ? undefined
          : state.providerApiKeys[model.provider];
    },
    snapshot: (id) => {
      const state = get();
      return resolveRunModel(id, state.allModels, state.connections, state.getApiKey);
    },
  }));
}
