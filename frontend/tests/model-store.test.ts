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
  updateModel(customModel.id, { name: "Renamed", description: "Updated" });
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
