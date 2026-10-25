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

 // Initial choices. Credentials and user-added models stay in memory for this session.
export const assistantModels: readonly AssistantModel[] = [
  // OpenAI
  {
    id: "openai/gpt-6-luna",
    name: "GPT-6 Luna",
    provider: "openai",
    description: "Fast, efficient, low-cost general purpose model",
  },
  {
    id: "openai/gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    provider: "openai",
    description: "Affordable coding, reasoning, and everyday tasks",
  },

  // OpenRouter - Free
  {
    id: "openrouter/openrouter/free",
    name: "OpenRouter Auto (Free)",
    provider: "openrouter",
    description: "Automatically routes to available free models",
  },
  {
    id: "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
    name: "Nemotron 3 Ultra (Free)",
    provider: "openrouter",
    description: "Free advanced reasoning, coding, and agent tasks",
  },
  {
    id: "openrouter/nvidia/nemotron-3.5-super-vl:free",
    name: "Nemotron 3.5 Super VL (Free)",
    provider: "openrouter",
    description: "Free multimodal reasoning, vision, and coding",
  },
  {
    id: "openrouter/cohere/north-mini-code:free",
    name: "North Mini Code (Free)",
    provider: "openrouter",
    description: "Free lightweight coding and tool calling",
  },

  // Anthropic
  {
    id: "anthropic/claude-haiku-5-5",
    name: "Claude Haiku 5.5",
    provider: "anthropic",
    description: "Fast, affordable chat and lightweight tasks",
  },
  {
    id: "anthropic/claude-sonnet-5-5",
    name: "Claude Sonnet 5.5",
    provider: "anthropic",
    description: "Balanced reasoning, writing, and coding",
  },

  // Ollama - Local
  {
    id: "ollama/gemma4:12b",
    name: "Gemma 4 12B",
    provider: "ollama",
    description: "Local reasoning, coding, and multimodal tasks",
  },
  {
    id: "ollama/gemma4:e4b",
    name: "Gemma 4 E4B",
    provider: "ollama",
    description: "Efficient local model for lightweight tasks",
  },
];


export const defaultModelId = "default";

export const defaultModel = {
  id: defaultModelId,
  name: "Default Model",
  description: "Ready to use server-configured model",
} as const;
