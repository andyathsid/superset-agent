import assert from "node:assert/strict";
import { test } from "node:test";
import { assistantModels } from "../features/assistant/config/models";
import { resolveRunModel, type RunModel } from "../features/assistant/runtime/model-config";
import {
  eventIsVisible,
  readModelEvents,
  findModelCheckpoint,
  type ModelChangeEvent,
} from "../features/assistant/runtime/model-history";
import {
  resolveModelContext,
  ModelRequestError,
} from "../features/assistant/runtime/server-model-config";
import { createModelFetch } from "../features/assistant/runtime/model-transport";
import type { Client } from "@langchain/langgraph-sdk";

const event: ModelChangeEvent = {
  id: "change-1",
  threadId: "thread-1",
  afterMessageId: "user-1",
  checkpointId: "checkpoint-1",
  checkpointNamespace: "",
  messagePath: ["user-1"],
  beforeMessageId: "answer-new",
  from: { id: "a", name: "Old name" },
  to: { id: "b", name: "New name" },
  createdAt: "2026-10-21T12:00:00Z",
};

test("retry events follow the new response branch and stay out of its sibling", () => {
  assert.equal(eventIsVisible(event, ["user-1", "answer-new", "user-2"]), true);
  assert.equal(eventIsVisible(event, ["user-1", "answer-old"]), false);
  assert.equal(eventIsVisible(event, ["edited-user", "answer-new"]), false);
  assert.equal(eventIsVisible(event, ["user-1"]), false);
});

test("persisted history survives removed models and malformed metadata", () => {
  const saved = readModelEvents({
    thread_name: "Test",
    model_change_bad: "{bad",
    model_change_valid: JSON.stringify(event),
  });
  assert.deepEqual(saved, [event]);
  assert.equal(saved[0].from.name, "Old name");
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

test("checkpoint lookup matches the full message path, including pagination", async () => {
  const calls: unknown[] = [];
  const firstPage = Array.from({ length: 100 }, (_, i) => ({
    checkpoint: { checkpoint_id: `other-${i}` },
    values: { messages: [{ id: "sibling" }] },
  }));
  const client = {
    threads: {
      getHistory: async (_id: string, options: unknown) => {
        calls.push(options);
        return calls.length === 1
          ? firstPage
          : [
              {
                checkpoint: { checkpoint_id: "correct" },
                values: { messages: [{ id: "user-1" }, { id: "answer-new" }] },
              },
            ];
      },
    },
  } as unknown as Client;
  const checkpoint = await findModelCheckpoint(client, "thread-1", ["user-1", "answer-new"]);
  assert.equal(checkpoint?.checkpoint_id, "correct");
  assert.equal(calls.length, 2);
});

test("submit and retry capture the current model without changing checkpoint configuration", async () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; payload: Record<string, any> }[] = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { href: "http://app.test/", origin: "http://app.test" } },
  });
  let selected: RunModel = { id: "default", name: "Default Model" };
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), payload: JSON.parse(String(init?.body)) });
    return new Response("{}", { status: 200 });
  };
  try {
    const send = createModelFetch(() => selected);
    await send("http://app.test/api/threads/thread-1/commands", {
      method: "POST",
      body: JSON.stringify({ method: "run.start", params: { input: { messages: [] } } }),
    });
    selected = {
      id: "custom/model",
      name: "Custom",
      provider: "custom",
      modelId: "model",
      baseUrl: "http://provider.test/v1",
      apiKey: "private-key",
    };
    await send("http://app.test/api/threads/thread-1/commands", {
      method: "POST",
      body: JSON.stringify({
        method: "run.start",
        params: { config: { configurable: { checkpoint_id: "fork-1" } } },
      }),
    });
    assert.equal(calls[0].payload.params.model_selection.id, "default");
    assert.equal(calls[1].payload.params.model_selection.id, "custom/model");
    assert.equal(calls[1].payload.params.config.configurable.checkpoint_id, "fork-1");
    assert.equal(JSON.stringify(calls[1].payload.params.metadata).includes("private-key"), false);
    assert.equal(calls[1].payload.params.metadata.ui_model_id, "custom/model");
    await send("http://external.test/commands", {
      method: "POST",
      body: JSON.stringify({ method: "run.start", params: {} }),
    });
    assert.equal(calls[2].payload.params.model_selection, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    Reflect.deleteProperty(globalThis, "window");
  }
});
