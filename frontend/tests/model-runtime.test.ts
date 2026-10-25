import assert from "node:assert/strict";
import { test } from "node:test";
import { type AssistantModel } from "../features/assistant/config/models";
import { resolveRunModel } from "../features/assistant/runtime/model-config";
import {
  resolveModelContext,
  ModelRequestError,
} from "../features/assistant/runtime/server-model-config";

const assistantModels: AssistantModel[] = [
  { id: "openai/gpt-4.1", provider: "openai", name: "OpenAI test", description: "" },
  {
    id: "openrouter/meta-llama/llama-3.3-70b-instruct",
    provider: "openrouter",
    name: "OpenRouter test",
    description: "",
  },
  { id: "ollama/llama3.2", provider: "ollama", name: "Ollama test", description: "" },
];

test("removed models require an explicit replacement", () => {
  assert.throws(
    () => resolveRunModel("removed/model", assistantModels, new Map(), () => "key"),
    /no longer exists/,
  );
});

test("provider model IDs preserve OpenRouter namespaces", () => {
  const openai = resolveRunModel("openai/gpt-4.1", assistantModels, new Map(), () => "key");
  const router = resolveRunModel(
    "openrouter/meta-llama/llama-3.3-70b-instruct",
    assistantModels,
    new Map(),
    () => "key",
  );
  assert.equal(openai.modelId, "gpt-4.1");
  assert.equal(router.modelId, "meta-llama/llama-3.3-70b-instruct");
  assert.throws(
    () => resolveRunModel("openai/gpt-4.1", assistantModels, new Map(), () => ""),
    /API key/,
  );
  assert.equal(
    resolveRunModel("ollama/llama3.2", assistantModels, new Map(), () => undefined).apiKey,
    "",
  );
});

test("server fixes official endpoints and validates custom endpoints", () => {
  const context = resolveModelContext({
    id: "openai/model",
    provider: "openai",
    modelId: "model",
    apiKey: "key",
    baseUrl: "http://untrusted.example",
  });
  assert.equal(context.model_base_url, "https://api.openai.com/v1");
  assert.throws(
    () =>
      resolveModelContext({
        id: "custom/model",
        provider: "custom",
        modelId: "model",
        apiKey: "key",
        baseUrl: "http://user:secret@example.com",
      }),
    ModelRequestError,
  );
  assert.throws(
    () =>
      resolveModelContext({ id: "openai/model", provider: "openai", modelId: "model", apiKey: "" }),
    ModelRequestError,
  );
  assert.equal(
    resolveModelContext({
      id: "ollama/model",
      provider: "ollama",
      modelId: "model",
      apiKey: "",
      baseUrl: "http://localhost:11434/v1",
    }).model_api_key,
    "",
  );
});
