import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client } from "@langchain/langgraph-sdk";
import { defaultModelId } from "../features/assistant/config/models";
import { createThreadModelStore } from "../features/assistant/runtime/thread-model-store";

type SavedThread = { thread_id: string; metadata?: Record<string, unknown> };
type Threads = {
  get: (id: string) => Promise<SavedThread>;
  create: (options: { metadata: Record<string, unknown> }) => Promise<SavedThread>;
  update: (id: string, options: { metadata: Record<string, unknown> }) => Promise<unknown>;
};
function storeWith(threads: Partial<Threads> = {}) {
  const unexpected = async () => {
    throw new Error("Unexpected client call");
  };
  return createThreadModelStore({
    threads: { get: unexpected, create: unexpected, update: unexpected, ...threads },
  } as unknown as Client).getState();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("new drafts use default and keep selections independent", async () => {
  const store = storeWith();
  assert.deepEqual(store.get("draft-A", false), {
    modelId: defaultModelId,
    ready: true,
    busy: false,
  });
  await store.select("draft-A", "openai/gpt-4.1", false);
  assert.equal(store.get("draft-A", false).modelId, "openai/gpt-4.1");
  assert.equal(store.get("draft-B", false).modelId, defaultModelId);
  assert.equal(store.get("remote-A", true).ready, false);
});

test("thread updates preserve previous snapshots and other threads' selector values", async () => {
  const store = createThreadModelStore({} as Client);
  const initial = store.getState();
  const draftB = initial.get("draft-B", false);
  const updates: unknown[] = [];
  const unsubscribe = store.subscribe((state) => updates.push(state));
  await initial.select("draft-A", "custom/model", false);
  assert.equal(updates.length, 1);
  assert.equal(initial.states.size, 0);
  assert.notEqual(store.getState().states, initial.states);
  assert.equal(store.getState().get("draft-B", false), draftB);
  assert.equal(store.getState().get("draft-A", false).modelId, "custom/model");
  unsubscribe();
  await initial.select("draft-A", "other/model", false);
  assert.equal(updates.length, 1);
});

test("initialization persists only draft model identity and registers the remote thread", async () => {
  const calls: unknown[] = [];
  const store = storeWith({
    create: async (options) => {
      calls.push(options);
      return { thread_id: "remote-A" };
    },
  });
  await store.select("draft-A", "custom/model", false);
  assert.deepEqual(await store.initialize("draft-A"), {
    remoteId: "remote-A",
    externalId: "remote-A",
  });
  assert.deepEqual(calls, [{ metadata: { selected_model_id: "custom/model" } }]);
  assert.deepEqual(store.get("remote-A", true), {
    modelId: "custom/model",
    ready: true,
    busy: false,
  });
  assert.equal(await store.forRun("remote-A"), "custom/model");
  assert.equal(store.get("draft-B", false).modelId, defaultModelId);
});

test("fresh stores restore saved selection and default legacy or invalid metadata", async () => {
  const metadata: Record<string, Record<string, unknown> | undefined> = {
    selected: { selected_model_id: "openai/gpt-4.1" },
    legacy: { thread_name: "Old" },
    empty: { selected_model_id: "" },
    invalid: { selected_model_id: 42 },
    missing: undefined,
  };
  const store = storeWith({ get: async (id) => ({ thread_id: id, metadata: metadata[id] }) });
  for (const id of Object.keys(metadata)) {
    assert.equal(await store.forRun(id), id === "selected" ? "openai/gpt-4.1" : defaultModelId);
    assert.equal(store.get(id, true).ready, true);
    assert.equal(store.get(id, true).busy, false);
  }
});

test("failed load blocks runs until successful explicit retry", async () => {
  let fail = true;
  const store = storeWith({
    get: async (id) => {
      if (fail) throw new Error("Network unavailable");
      return { thread_id: id, metadata: { selected_model_id: "custom/model" } };
    },
  });
  await assert.rejects(store.forRun("A"), /Could not load this thread's model/);
  assert.equal(store.get("A", true).ready, false);
  assert.equal(store.get("A", true).busy, false);
  await assert.rejects(store.forRun("A"), /Retry before sending/);
  fail = false;
  await store.load("A");
  assert.equal(await store.forRun("A"), "custom/model");
  assert.equal(store.get("A", true).error, undefined);
});

test("selection updates optimistically and runs wait for persistence", async () => {
  const save = deferred<unknown>();
  const calls: unknown[] = [];
  const store = storeWith({
    get: async (id) => ({ thread_id: id }),
    update: (id, options) => {
      calls.push({ id, ...options });
      return save.promise;
    },
  });
  await store.load("A");
  const saving = store.select("A", "custom/model", true);
  assert.deepEqual(store.get("A", true), { modelId: "custom/model", ready: true, busy: true });
  let runReady = false;
  const run = store.forRun("A").then((model) => {
    runReady = true;
    return model;
  });
  await Promise.resolve();
  assert.equal(runReady, false);
  assert.deepEqual(calls, [{ id: "A", metadata: { selected_model_id: "custom/model" } }]);
  save.resolve({});
  await saving;
  assert.equal(await run, "custom/model");
  assert.equal(store.get("A", true).busy, false);
});

test("failed update restores previous selection and exposes error", async () => {
  const save = deferred<unknown>();
  const store = storeWith({
    get: async (id) => ({ thread_id: id, metadata: { selected_model_id: "old/model" } }),
    update: () => save.promise,
  });
  await store.load("A");
  const saving = store.select("A", "new/model", true);
  const run = store.forRun("A");
  save.reject(new Error("Save failed"));
  await saving;
  assert.equal(await run, "old/model");
  assert.deepEqual(store.get("A", true), {
    modelId: "old/model",
    ready: true,
    busy: false,
    error: "Could not save the model selection. Your previous model is still selected.",
  });
});

test("concurrent loads and runs share one lookup", async () => {
  const lookup = deferred<SavedThread>();
  const calls: string[] = [];
  const store = storeWith({
    get: (id) => {
      calls.push(id);
      return lookup.promise;
    },
  });
  const first = store.load("A");
  const second = store.load("A");
  const run = store.forRun("A");
  assert.equal(first, second);
  assert.deepEqual(calls, ["A"]);
  assert.equal(store.get("A", true).busy, true);
  lookup.resolve({ thread_id: "A", metadata: { selected_model_id: "custom/model" } });
  await Promise.all([first, second]);
  assert.equal(await run, "custom/model");
});

test("two writes are independent and late loading A does not overwrite B", async () => {
  const lookup = deferred<SavedThread>();
  const saveA = deferred<unknown>();
  const saveB = deferred<unknown>();
  let reloadA = false;
  const calls: string[] = [];
  const store = storeWith({
    get: (id) => (id === "A" && reloadA ? lookup.promise : Promise.resolve({ thread_id: id })),
    update: (id) => {
      calls.push(id);
      return id === "A" ? saveA.promise : saveB.promise;
    },
  });
  await Promise.all([store.load("A"), store.load("B")]);
  const writingA = store.select("A", "model-A", true);
  const writingB = store.select("B", "model-B", true);
  assert.deepEqual(calls, ["A", "B"]);
  saveB.resolve({});
  await writingB;
  assert.equal(await store.forRun("B"), "model-B");
  assert.equal(store.get("A", true).busy, true);
  saveA.resolve({});
  await writingA;
  assert.equal(await store.forRun("A"), "model-A");
  reloadA = true;
  const loading = store.load("A");
  assert.equal(await store.forRun("B"), "model-B");
  lookup.resolve({ thread_id: "A", metadata: { selected_model_id: "restored-A" } });
  await loading;
  assert.equal(await store.forRun("A"), "restored-A");
  assert.equal(await store.forRun("B"), "model-B");
});

test("saving for a run corrects persisted metadata after an ambiguous selection failure", async () => {
  let savedId = "old/model";
  let failSelection = true;
  const writes: unknown[] = [];
  const store = storeWith({
    get: async (id) => ({ thread_id: id, metadata: { selected_model_id: savedId } }),
    update: async (id, options) => {
      writes.push({ id, ...options });
      savedId = String(options.metadata.selected_model_id);
      if (failSelection) throw new Error("Response lost after server committed");
      return {};
    },
  });
  await store.load("A");
  await store.select("A", "new/model", true);
  assert.equal(store.get("A", true).modelId, "old/model");
  assert.equal(savedId, "new/model");
  failSelection = false;
  const snapshot = await store.forRun("A");
  await store.saveForRun("A", snapshot);
  assert.equal(savedId, snapshot);
  assert.equal(store.get("A", true).error, undefined);
  assert.equal(store.get("A", true).busy, false);
  assert.deepEqual(writes[1], { id: "A", metadata: { selected_model_id: "old/model" } });
});

test("failed run metadata persistence exposes an error and allows an explicit retry", async () => {
  const save = deferred<unknown>();
  let fail = true;
  const store = storeWith({
    get: async (id) => ({ thread_id: id }),
    update: () => (fail ? save.promise : Promise.resolve({})),
  });
  await store.load("A");
  const saving = store.saveForRun("A", await store.forRun("A"));
  await Promise.resolve();
  assert.equal(store.get("A", true).busy, true);
  const rejected = assert.rejects(saving, /The message was not sent/);
  save.reject(new Error("Network unavailable"));
  await rejected;
  assert.equal(store.get("A", true).modelId, defaultModelId);
  assert.equal(store.get("A", true).busy, false);
  assert.match(store.get("A", true).error ?? "", /The message was not sent/);
  fail = false;
  await store.saveForRun("A", await store.forRun("A"));
  assert.equal(store.get("A", true).error, undefined);
});
