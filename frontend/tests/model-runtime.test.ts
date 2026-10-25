import assert from "node:assert/strict";
import { test } from "node:test";
import { assistantModels } from "../features/assistant/config/models";
import { resolveRunModel, type RunModel } from "../features/assistant/runtime/model-config";
import {
  resolveModelContext,
  ModelRequestError,
} from "../features/assistant/runtime/server-model-config";
import { createModelFetch } from "../features/assistant/runtime/model-transport";

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

type CapturedRequest = { url: string; payload: Record<string, any> };

async function withTransport(run: (calls: CapturedRequest[]) => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const calls: CapturedRequest[] = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { href: "http://app.test/", origin: "http://app.test" } },
  });
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), payload: JSON.parse(String(init?.body)) });
    return new Response("{}", { status: 200 });
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

const defaultModel: RunModel = { id: "default", name: "Default Model" };
const customModel: RunModel = {
  id: "custom/model",
  name: "Custom",
  provider: "custom",
  modelId: "model",
  baseUrl: "http://provider.test/v1",
  apiKey: "private-key",
};

function command(method = "run.start", params: Record<string, unknown> = {}) {
  return { method: "POST", body: JSON.stringify({ method, params }) };
}

test("submit waits for selection persistence and keeps the URL thread during switches", async () => {
  await withTransport(async (calls) => {
    const threads: (string | undefined)[] = [];
    let finishSave!: (model: RunModel) => void;
    const pendingSave = new Promise<RunModel>((resolve) => {
      finishSave = resolve;
    });
    const send = createModelFetch((threadId) => {
      threads.push(threadId);
      return threadId === "thread A" ? pendingSave : customModel;
    });
    const first = send("/api/threads/thread%20A/commands", command());
    await Promise.resolve();
    assert.equal(calls.length, 0);
    await send("/api/threads/thread-B/commands", command());
    finishSave(defaultModel);
    await first;
    assert.deepEqual(threads, ["thread A", "thread-B"]);
    assert.deepEqual(calls[0].payload.params.model_selection, customModel);
    assert.deepEqual(calls[1].payload.params.model_selection, defaultModel);
  });
});

test("retry snapshots current selection and preserves checkpoint and metadata", async () => {
  await withTransport(async (calls) => {
    let selected = { ...defaultModel };
    const send = createModelFetch(() => selected);
    await send("/api/threads/thread-1/commands", command());
    selected.name = "Changed";
    selected = customModel;
    await send(
      "/api/threads/thread-1/commands",
      command("run.start", {
        config: { configurable: { checkpoint_id: "fork-1" } },
        metadata: { existing: "value" },
      }),
    );
    assert.deepEqual(calls[0].payload.params.model_selection, defaultModel);
    const retry = calls[1].payload.params;
    assert.deepEqual(retry.model_selection, customModel);
    assert.equal(retry.config.configurable.checkpoint_id, "fork-1");
    assert.deepEqual(retry.metadata, {
      existing: "value",
      ui_model_id: customModel.id,
      ui_model_name: customModel.name,
    });
    assert.equal(JSON.stringify(retry.metadata).includes("private-key"), false);
  });
});

test("input.respond resolves the same thread model", async () => {
  await withTransport(async (calls) => {
    const send = createModelFetch((threadId) => {
      assert.equal(threadId, "thread-1");
      return customModel;
    });
    await send("/api/threads/thread-1/commands", command("input.respond", { value: "continue" }));
    assert.deepEqual(calls[0].payload.params.model_selection, customModel);
    assert.equal(calls[0].payload.params.value, "continue");
  });
});

test("thread runs and stateless runs inject model selection into the run payload", async () => {
  await withTransport(async (calls) => {
    const threads: (string | undefined)[] = [];
    const send = createModelFetch((threadId) => {
      threads.push(threadId);
      return defaultModel;
    });
    for (const path of ["/api/threads/thread-1/runs/stream", "/api/runs", "/api/runs/wait"]) {
      await send(path, { method: "POST", body: JSON.stringify({ input: { messages: [] } }) });
    }
    assert.deepEqual(threads, ["thread-1", undefined, undefined]);
    assert.ok(calls.every(({ payload }) => payload.model_selection.id === "default"));
  });
});

test("failed model resolution prevents the request", async () => {
  await withTransport(async (calls) => {
    const send = createModelFetch(async () => {
      throw new Error("Save failed");
    });
    await assert.rejects(send("/api/threads/thread-1/commands", command()), /Save failed/);
    assert.equal(calls.length, 0);
  });
});

test("external requests and unrelated commands do not resolve or inject a model", async () => {
  await withTransport(async (calls) => {
    const send = createModelFetch(() => {
      throw new Error("Must not resolve");
    });
    await send("http://external.test/commands", command());
    await send("/api/threads/thread-1/commands", command("thread.get"));
    assert.ok(calls.every(({ payload }) => payload.params.model_selection === undefined));
  });
});

test("submit and retry persist the same snapshot before starting the run", async () => {
  await withTransport(async (calls) => {
    let selected = customModel;
    const writes: { threadId: string; model: RunModel }[] = [];
    let finishSave!: () => void;
    const saving = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    const send = createModelFetch(
      () => selected,
      async (threadId, model) => {
        writes.push({ threadId, model });
        await saving;
      },
    );
    const submitting = send("/api/threads/thread%20A/commands", command());
    await Promise.resolve();
    assert.equal(calls.length, 0);
    assert.deepEqual(writes, [{ threadId: "thread A", model: customModel }]);
    selected = defaultModel;
    finishSave();
    await submitting;
    assert.deepEqual(calls[0].payload.params.model_selection, customModel);
    await send("/api/threads/thread-B/runs/stream", {
      method: "POST",
      body: JSON.stringify({ config: { configurable: { checkpoint_id: "retry-checkpoint" } } }),
    });
    assert.deepEqual(writes[1], { threadId: "thread-B", model: defaultModel });
    assert.deepEqual(calls[1].payload.model_selection, defaultModel);
    assert.equal(calls[1].payload.config.configurable.checkpoint_id, "retry-checkpoint");
  });
});

test("failed thread metadata save prevents the run request", async () => {
  await withTransport(async (calls) => {
    const send = createModelFetch(
      () => customModel,
      async () => {
        throw new Error("Could not save the model selection");
      },
    );
    await assert.rejects(send("/api/threads/thread-A/commands", command()), /Could not save/);
    assert.equal(calls.length, 0);
  });
});

test("responses persist thread selection while stateless runs skip thread persistence", async () => {
  await withTransport(async (calls) => {
    const writes: string[] = [];
    const send = createModelFetch(
      () => defaultModel,
      async (id) => {
        writes.push(id);
      },
    );
    await send("/api/threads/thread-A/commands", command("input.respond", { value: "continue" }));
    await send("/api/runs/stream", { method: "POST", body: "{}" });
    assert.deepEqual(writes, ["thread-A"]);
    assert.equal(calls.length, 2);
  });
});
