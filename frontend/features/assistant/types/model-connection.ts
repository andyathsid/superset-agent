export type ProviderId = "openrouter" | "ollama" | "custom";

export type ModelConnection = {
  provider: ProviderId;
  endpoint: string;
  model: string;
  apiKey: string;
};

export type ProviderConnections = Record<ProviderId, ModelConnection>;
