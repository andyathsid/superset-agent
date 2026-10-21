import {
  defaultModelId,
  modelProviders,
  providerConnections,
  type ModelProviderId,
} from "../config/models";

export class ModelRequestError extends Error {}

export function resolveModelContext(selection: unknown): Record<string, string> {
  if (!selection || typeof selection !== "object")
    throw new ModelRequestError("Select a model before sending a message.");
  const model = selection as Record<string, unknown>;
  if (model.id === defaultModelId) {
    // Preserve the existing server-managed default; never send its credential to the browser.
    const apiKey =
      process.env.MODEL_API_KEY?.trim() || process.env.OPENROUTER_TESTING_API_KEY?.trim();
    if (!apiKey) return {}; // Agent environment supplies the default when Next has no model configuration.
    return {
      model_provider: process.env.MODEL_PROVIDER?.trim() || "openrouter",
      model_name: process.env.MODEL_NAME?.trim() || "minimax/minimax-m3.1-flash:free",
      model_base_url: process.env.MODEL_BASE_URL?.trim() || "https://openrouter.ai/api/v1",
      model_api_key: apiKey,
    };
  }
  if (
    typeof model.provider !== "string" ||
    !modelProviders.some((item) => item.id === model.provider)
  )
    throw new ModelRequestError("Unsupported model provider.");
  const provider = model.provider as ModelProviderId;
  const policy = providerConnections[provider];
  if (typeof model.modelId !== "string" || !model.modelId.trim())
    throw new ModelRequestError("Model ID is required.");
  if (typeof model.id !== "string" || !model.id.startsWith(`${provider}/`))
    throw new ModelRequestError("Invalid model selection.");
  const key = typeof model.apiKey === "string" ? model.apiKey.trim() : "";
  if (policy.requiresApiKey && !key)
    throw new ModelRequestError("An API key is required for this provider.");
  let baseUrl = policy.baseUrl;
  if (policy.editableBaseUrl) {
    if (typeof model.baseUrl !== "string")
      throw new ModelRequestError("A model endpoint is required.");
    try {
      const url = new URL(model.baseUrl.trim());
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error("Invalid endpoint");
      baseUrl = url.href.replace(/\/$/, "");
    } catch {
      throw new ModelRequestError(
        "Enter a valid HTTP(S) model endpoint without credentials, query parameters, or fragments.",
      );
    }
  }
  return {
    model_provider: provider,
    model_name: model.modelId.trim(),
    model_base_url: baseUrl,
    model_api_key: key,
  };
}
