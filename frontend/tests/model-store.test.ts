import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assistantModels,
  defaultModelId,
  type AssistantModel,
} from "../features/assistant/config/models";
import { createModelStore } from "../features/assistant/runtime/model-store";

const customModel: AssistantModel = {
  id: "custom/test-model",
  name: "Test model",
  provider: "custom",
  description: "Session model",
};
const connection = { modelId: "test-model", baseUrl: "https://example.com/v1" };

test("model actions expose a complete configuration and snapshots read the latest state", () => {
  const store = createModelStore();
  const { addModel, snapshot, setCustomApiKey, updateModel, removeModel } = store.getState();
  const observed: unknown[] = [];
  const unsubscribe = store.subscribe((state) => {
    if (state.allModels.some((model) => model.id === customModel.id)) {
      observed.push(state.snapshot(customModel.id));
    }
  });
  addModel(customModel, connection, "first-key");
  assert.equal(observed.length, 1);
  assert.deepEqual(observed[0], {
    id: customModel.id,
    name: customModel.name,
    provider: "custom",
    ...connection,
    apiKey: "first-key",
  });
  const firstRun = snapshot(customModel.id);
  setCustomApiKey(customModel.id, "second-key");
  updateModel(
    customModel.id,
    { name: "Renamed", description: "Updated", provider: "custom" },
    connection,
  );
  assert.equal(snapshot(customModel.id).apiKey, "second-key");
  assert.equal(snapshot(customModel.id).name, "Renamed");
  assert.equal(firstRun.apiKey, "first-key");
  assert.equal(firstRun.name, customModel.name);
  unsubscribe();
  removeModel(customModel.id);
  assert.equal(store.getState().connections.has(customModel.id), false);
  assert.equal(store.getState().customApiKeys[customModel.id], undefined);
  assert.throws(() => snapshot(customModel.id), /no longer exists/);
});

test("provider keys are shared, while custom keys and Ollama remain independent", () => {
  const store = createModelStore();
  const { addModel, getApiKey, setProviderApiKey, snapshot, removeModel } = store.getState();
  const openaiModels = assistantModels.filter((model) => model.provider === "openai");
  assert.ok(openaiModels.length > 1);
  assert.throws(() => snapshot(openaiModels[0].id), /API key/);
  setProviderApiKey("openai", "shared-key");
  for (const model of openaiModels) assert.equal(getApiKey(model), "shared-key");
  addModel(customModel, connection, "custom-key");
  assert.equal(getApiKey(customModel), "custom-key");
  const ollamaModel = { ...customModel, id: "ollama/test-model", provider: "ollama" as const };
  addModel(ollamaModel, { ...connection, baseUrl: "http://localhost:11434/v1" }, "ignored-key");
  assert.equal(getApiKey(ollamaModel), undefined);
  assert.equal(snapshot(ollamaModel.id).apiKey, "");
  removeModel(openaiModels[0].id);
  assert.equal(getApiKey(openaiModels[1]), "shared-key");
  setProviderApiKey("openai", "");
  assert.throws(() => snapshot(openaiModels[1].id), /API key/);
  assert.equal(getApiKey(customModel), "custom-key");
});

test("editing a connection and custom key is atomic and preserves thread selection", async () => {
  const store = createModelStore();
  const { addModel, updateModel, snapshot, threadModels } = store.getState();
  addModel(customModel, connection, "original-key");
  await threadModels.getState().select("draft", customModel.id, false);
  const previousRun = snapshot(customModel.id);
  const observed: unknown[] = [];
  store.subscribe((state) => observed.push(state.snapshot(customModel.id)));
  const updatedConnection = { modelId: "vendor/new-model", baseUrl: "https://new.example.com/v1" };

  updateModel(
    customModel.id,
    { name: "Updated model", description: "Updated description", provider: "custom" },
    updatedConnection,
    "updated-key",
  );

  assert.deepEqual(observed, [
    {
      id: customModel.id,
      name: "Updated model",
      provider: "custom",
      ...updatedConnection,
      apiKey: "updated-key",
    },
  ]);
  assert.equal(threadModels.getState().get("draft", false).modelId, customModel.id);
  assert.equal(previousRun.modelId, connection.modelId);
  assert.equal(previousRun.apiKey, "original-key");
});

test("editing shared-provider models preserves keys and supports changing provider", () => {
  const store = createModelStore();
  const { updateModel, setProviderApiKey, snapshot } = store.getState();
  const model = assistantModels.find((item) => item.provider === "openai")!;
  setProviderApiKey("openai", "openai-key");
  setProviderApiKey("anthropic", "anthropic-key");
  updateModel(
    model.id,
    { ...model, name: "New name" },
    { modelId: "new-openai-model", baseUrl: "https://api.openai.com/v1" },
    "ignored-key",
  );
  assert.equal(snapshot(model.id).apiKey, "openai-key");
  assert.equal(snapshot(model.id).modelId, "new-openai-model");

  updateModel(
    model.id,
    { ...model, provider: "anthropic" },
    { modelId: "new-claude-model", baseUrl: "https://api.anthropic.com" },
  );
  assert.equal(snapshot(model.id).id, model.id);
  assert.equal(snapshot(model.id).provider, "anthropic");
  assert.equal(snapshot(model.id).modelId, "new-claude-model");
  assert.equal(snapshot(model.id).apiKey, "anthropic-key");
  assert.deepEqual(store.getState().providerApiKeys, {
    openai: "openai-key",
    anthropic: "anthropic-key",
  });
});

test("switching to Custom stores its key, and switching to Ollama removes it", () => {
  const store = createModelStore();
  const { updateModel, snapshot } = store.getState();
  const model = assistantModels.find((item) => item.provider === "openai")!;
  updateModel(model.id, { ...model, provider: "custom" }, connection, "custom-key");
  assert.equal(snapshot(model.id).apiKey, "custom-key");
  assert.equal(store.getState().customApiKeys[model.id], "custom-key");

  updateModel(
    model.id,
    { ...model, provider: "ollama" },
    { modelId: "local-model", baseUrl: "http://localhost:12345/v1" },
  );
  assert.equal(snapshot(model.id).apiKey, "");
  assert.equal(snapshot(model.id).baseUrl, "http://localhost:12345/v1");
  assert.equal(store.getState().customApiKeys[model.id], undefined);
});

test("stores isolate credentials, model configuration, and thread selections per provider", async () => {
  const first = createModelStore();
  const second = createModelStore();
  first.getState().addModel(customModel, connection, "private-key");
  first.getState().setProviderApiKey("openai", "provider-key");
  await first.getState().threadModels.getState().select("draft", customModel.id, false);
  assert.equal(
    second.getState().allModels.some((model) => model.id === customModel.id),
    false,
  );
  assert.deepEqual(second.getState().providerApiKeys, {});
  assert.deepEqual(second.getState().customApiKeys, {});
  assert.equal(second.getState().connections.size, 0);
  assert.equal(
    second.getState().threadModels.getState().get("draft", false).modelId,
    defaultModelId,
  );
});
