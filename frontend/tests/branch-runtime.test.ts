import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client } from "@langchain/langgraph-sdk";
import {
  buildBranchHistory,
  convertBranchMessages,
  loadBranchHistory,
  matchBranchPath,
  type BranchState,
} from "../features/assistant/runtime/branch-history";
import { createBranchFetch } from "../features/assistant/runtime/branch-transport";

const human = (id: string, content: string) => ({ id, type: "human", content });
const ai = (id: string, content: string) => ({ id, type: "ai", content });
function state(id: string, parent: string | null, messages: object[]): BranchState {
  return {
    checkpoint: { thread_id: "thread", checkpoint_id: id, checkpoint_ns: "", checkpoint_map: {} },
    parent_checkpoint: parent
      ? { thread_id: "thread", checkpoint_id: parent, checkpoint_ns: "", checkpoint_map: {} }
      : null,
    values: { messages },
    next: [],
    tasks: [],
    metadata: {},
    created_at: "2026-10-22T00:00:00Z",
  } as BranchState;
}

test("history keeps sibling answers and excludes intermediate execution snapshots", () => {
  const root = state("root", null, []);
  const input = state("input", "root", [human("u", "Hello")]);
  const old = state("old", "input", [human("u", "Hello"), ai("a", "First")]);
  const next = state("new", "input", [human("u", "Hello"), ai("b", "Second")]);
  const history = buildBranchHistory([next, old, input, root]);
  assert.equal(history.entries.length, 3);
  assert.equal(history.entries.filter((entry) => entry.parentId === "u").length, 2);
  assert.equal(history.checkpoints.get("a")?.checkpoint.checkpoint_id, "old");
  assert.equal(history.checkpoints.get("b")?.checkpoint.checkpoint_id, "new");
});

test("edits reusing ids remain distinct, including descendants", () => {
  const old = state("old", null, [human("u", "Old"), ai("a", "Same")]);
  const next = state("new", null, [human("u", "Edited"), ai("a", "Same")]);
  const history = buildBranchHistory([next, old]);
  assert.equal(history.entries.length, 4);
  const oldPath = matchBranchPath(history, convertBranchMessages(old));
  const nextPath = matchBranchPath(history, convertBranchMessages(next));
  assert.notEqual(oldPath[0], nextPath[0]);
  assert.notEqual(oldPath[1], nextPath[1]);
  assert.equal(history.checkpoints.get(nextPath[1]!)?.checkpoint.checkpoint_id, "new");
});

test("tool messages stay attached to their assistant response", () => {
  const messages = [
    human("u", "Search"),
    { ...ai("call", ""), tool_calls: [{ id: "tool-1", name: "search", args: {} }] },
    { id: "result", type: "tool", content: "Found", tool_call_id: "tool-1", name: "search" },
    ai("answer", "Done"),
  ];
  const history = buildBranchHistory([state("done", null, messages)]);
  const tool = history.entries
    .flatMap((entry) => (entry.message.role === "assistant" ? entry.message.content : []))
    .find((part) => part.type === "tool-call");
  assert.equal(tool?.result, "Found");
  assert.equal(history.checkpoints.size, 1);
});

test("history pagination loads every page and rejects a repeated full page", async () => {
  const first = Array.from({ length: 100 }, (_, i) => state(String(101 - i), null, []));
  const cursors: unknown[] = [];
  const client = {
    threads: {
      getHistory: async (_id: string, options: { before?: unknown }) => {
        cursors.push(options.before);
        return cursors.length === 1 ? first : [state("1", null, [])];
      },
    },
  } as unknown as Client;
  assert.equal((await loadBranchHistory(client, "thread")).length, 101);
  assert.deepEqual(cursors[1], { configurable: { checkpoint_id: "2" } });
  const repeated = { threads: { getHistory: async () => first } } as unknown as Client;
  await assert.rejects(loadBranchHistory(repeated, "thread"), /did not advance/);
});

test("transport pins hydration and continuation, preserving explicit forks and other threads", async () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    value: { location: { href: "http://localhost:3000/", origin: "http://localhost:3000" } },
    configurable: true,
  });
  try {
    const calls: { url: string; body?: string }[] = [];
    const accepted: string[] = [];
    const next: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), body: init?.body as string | undefined });
      return new Response("{}", { status: 200 });
    };
    const transport = createBranchFetch(
      next,
      (id) => (id === "t" ? { checkpointId: "old" } : undefined),
      (id) => accepted.push(id),
    );
    await transport("http://localhost:3000/api/threads/t/state");
    assert.equal(calls.at(-1)?.url, "http://localhost:3000/api/threads/t/state/old");
    await transport("http://localhost:3000/api/threads/t/commands", {
      method: "POST",
      body: JSON.stringify({ method: "run.start", params: { input: {} } }),
    });
    assert.equal(JSON.parse(calls.at(-1)!.body!).params.config.configurable.checkpoint_id, "old");
    assert.deepEqual(accepted, ["t"]);
    await transport("http://localhost:3000/api/threads/t/runs/stream", {
      method: "POST",
      body: JSON.stringify({ config: { configurable: { checkpoint_id: "explicit" } } }),
    });
    assert.equal(JSON.parse(calls.at(-1)!.body!).config.configurable.checkpoint_id, "explicit");
    await transport("http://localhost:3000/api/threads/other/state");
    assert.equal(calls.at(-1)?.url, "http://localhost:3000/api/threads/other/state");
  } finally {
    Object.defineProperty(globalThis, "window", { value: previousWindow, configurable: true });
  }
});

test("continuing an older branch preserves sibling order after reload", () => {
  const root = state("root", null, []);
  const input = state("input", "root", [human("u", "Hello")]);
  const old = state("old", "input", [human("u", "Hello"), ai("a", "First")]);
  const next = state("new", "input", [human("u", "Hello"), ai("b", "Second")]);
  const continued = state("continued", "old", [
    human("u", "Hello"),
    ai("a", "First"),
    human("u2", "Continue"),
    ai("c", "Third"),
  ]);
  const history = buildBranchHistory([continued, next, old, input, root]);
  assert.deepEqual(
    history.entries.filter((entry) => entry.parentId === "u").map((entry) => entry.message.id),
    ["a", "b"],
  );
  assert.equal(history.checkpoints.get("c")?.checkpoint.checkpoint_id, "continued");
});

test("a missing selected checkpoint cannot hydrate as an empty new thread", async () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    value: { location: { href: "http://localhost:3000/", origin: "http://localhost:3000" } },
    configurable: true,
  });
  try {
    const transport = createBranchFetch(
      async () => new Response("Missing", { status: 404 }),
      () => ({ checkpointId: "deleted" }),
      () => assert.fail("No run was accepted"),
    );
    const response = await transport("http://localhost:3000/api/threads/t/state");
    assert.equal(response.status, 409);
    assert.match(await response.text(), /no longer available/);
  } finally {
    Object.defineProperty(globalThis, "window", { value: previousWindow, configurable: true });
  }
});
