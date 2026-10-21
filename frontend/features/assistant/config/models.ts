export const modelProviders = [
  { id: "anthropic", name: "Claude" },
  { id: "openai", name: "OpenAI" },
  { id: "openrouter", name: "OpenRouter" },
  { id: "ollama", name: "Ollama" },
  { id: "custom", name: "Custom Model" },
] as const;

export type ModelProviderId = (typeof modelProviders)[number]["id"];
export type SharedKeyProvider = Exclude<ModelProviderId, "ollama" | "custom">;
export type ProviderApiKeys = Partial<Record<SharedKeyProvider, string>>;

export type AssistantModel = {
  id: string;
  name: string;
  provider: ModelProviderId;
  description: string;
};

export type ModelConnection = {
  modelId: string;
  baseUrl: string;
};

export const providerConnections: Record<
  ModelProviderId,
  { baseUrl: string; editableBaseUrl: boolean; requiresApiKey: boolean }
> = {
  anthropic: { baseUrl: "https://api.anthropic.com", editableBaseUrl: false, requiresApiKey: true },
  openai: { baseUrl: "https://api.openai.com/v1", editableBaseUrl: false, requiresApiKey: true },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    editableBaseUrl: false,
    requiresApiKey: true,
  },
  ollama: { baseUrl: "http://localhost:11434/v1", editableBaseUrl: true, requiresApiKey: false },
  custom: { baseUrl: "", editableBaseUrl: true, requiresApiKey: true },
};

// Initial choices. Credentials and user-added models stay in memory for this session.
export const assistantModels: readonly AssistantModel[] = [
  {
    id: "openai/gpt-4.1",
    name: "GPT-4.1",
    provider: "openai",
    description: "General purpose and coding",
  },
  {
    id: "openai/gpt-4.1-mini",
    name: "GPT-4.1 mini",
    provider: "openai",
    description: "Fast and lightweight",
  },
  {
    id: "openrouter/deepseek/deepseek-r1",
    name: "DeepSeek R1",
    provider: "openrouter",
    description: "Reasoning via OpenRouter",
  },
  {
    id: "openrouter/meta-llama/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B",
    provider: "openrouter",
    description: "Open model via OpenRouter",
  },
  {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    description: "Writing and coding",
  },
  {
    id: "anthropic/claude-opus-4",
    name: "Claude Opus 4",
    provider: "anthropic",
    description: "Complex tasks and reasoning",
  },
  {
    id: "ollama/llama3.2",
    name: "Llama 3.2",
    provider: "ollama",
    description: "Local model via Ollama",
  },
  {
    id: "ollama/qwen2.5",
    name: "Qwen 2.5",
    provider: "ollama",
    description: "Local multilingual model",
  },
  {
    id: "custom/demo",
    name: "Custom Demo",
    provider: "custom",
    description: "Demo custom model",
  },
];

export const defaultModelId = "default";

export const defaultModel = {
  id: defaultModelId,
  name: "Default Model",
  description: "Ready to use server-configured model",
} as const;
