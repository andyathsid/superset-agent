import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../app/api/[..._path]/route";

const model = {
  id: "custom/model",
  name: "Custom",
  provider: "custom",
  modelId: "model",
  baseUrl: "https://provider.test/v1",
  apiKey: "private-key",
};

type Call = { url: string; method: string | undefined; payload: any };

async function withProxy(run: (calls: Call[]) => Promise<void>, failSave = false) {
  const originalFetch = globalThis.fetch;
  const originalApiUrl = process.env.LANGGRAPH_API_URL;
  const calls: Call[] = [];
  process.env.LANGGRAPH_API_URL = "https://graph.test";
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method,
      payload: JSON.parse(String(init?.body)),
    });
    return new Response("{}", { status: failSave && init?.method === "PATCH" ? 500 : 200 });
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiUrl === undefined) delete process.env.LANGGRAPH_API_URL;
    else process.env.LANGGRAPH_API_URL = originalApiUrl;
  }
}

function request(path: string, payload: unknown) {
  return POST(
    new NextRequest(`http://app.test/api/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

test("submit, checkpoint retry and resume save the selected model before sending", async () => {
  await withProxy(async (calls) => {
    for (const method of ["run.start", "input.respond"]) {
      const response = await request("threads/thread-A/commands", {
        method,
        params: {
          config: {
            configurable: { model_selection: model, checkpoint_id: "fork-1", mode: "test" },
          },
          metadata: { existing: "value" },
          context: { existing: "context" },
        },
      });
      assert.equal(response.status, 200);
      const [save, run] = calls.splice(0);
      assert.equal(save.method, "PATCH");
      assert.equal(save.url, "https://graph.test/threads/thread-A");
      assert.deepEqual(save.payload, { metadata: { selected_model_id: model.id } });
      assert.equal(run.method, "POST");
      assert.equal(run.payload.method, method);
      const params = run.payload.params;
      assert.deepEqual(params.config.configurable, { checkpoint_id: "fork-1", mode: "test" });
      assert.equal(params.context.model_api_key, model.apiKey);
      assert.equal(params.context.model_name, model.modelId);
      assert.equal(params.context.existing, "context");
      assert.equal(params.metadata.existing, "value");
      assert.equal(params.metadata.ui_model_id, model.id);
      assert.equal(params.metadata.ui_model_name, model.name);
      assert.equal(JSON.stringify(params.config).includes(model.apiKey), false);
      assert.equal(JSON.stringify(params.metadata).includes(model.apiKey), false);
    }
  });
});

test("each run persists its own snapshot while thread requests overlap", async () => {
  await withProxy(async (calls) => {
    const fetchRequest = globalThis.fetch;
    let finishSave!: () => void;
    const pendingSave = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    globalThis.fetch = async (input, init) => {
      const response = await fetchRequest(input, init);
      if (String(input).endsWith("/thread-A") && init?.method === "PATCH") await pendingSave;
      return response;
    };
    const first = request("threads/thread-A/runs/stream", {
      config: { configurable: { model_selection: model } },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "PATCH");
    await request("threads/thread-B/runs/stream", {
      config: { configurable: { model_selection: { id: "default", name: "Default Model" } } },
    });
    finishSave();
    await first;
    assert.equal(calls[1].payload.metadata.selected_model_id, "default");
    assert.equal(calls[2].payload.context.model_selection_id, "default");
    assert.equal(calls[3].payload.context.model_selection_id, model.id);
  });
});

test("metadata save failures prevent both submit and resume", async () => {
  await withProxy(async (calls) => {
    for (const method of ["run.start", "input.respond"]) {
      const response = await request("threads/thread-A/commands", {
        method,
        params: { config: { configurable: { model_selection: model } } },
      });
      assert.equal(response.status, 502);
      assert.match((await response.json()).error, /The message was not sent/);
    }
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.method === "PATCH"));
  }, true);
});

test("network errors while saving never forward the original run", async () => {
  await withProxy(async (calls) => {
    globalThis.fetch = async () => {
      throw new Error("Save network failure");
    };
    const response = await request("threads/thread-A/runs/stream", {
      config: { configurable: { model_selection: model } },
    });
    assert.equal(response.status, 500);
    assert.equal(calls.length, 0);
  });
});

test("stateless runs skip persistence and unrelated commands pass through", async () => {
  await withProxy(async (calls) => {
    await request("runs/stream", { config: { configurable: { model_selection: model } } });
    await request("threads/thread-A/commands", { method: "thread.get", params: {} });
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.method === "POST"));
    assert.equal(calls[0].payload.context.model_selection_id, model.id);
    assert.deepEqual(calls[1].payload, { method: "thread.get", params: {} });
  });
});

test("invalid model selection prevents persistence and execution", async () => {
  await withProxy(async (calls) => {
    const response = await request("threads/thread-A/runs/stream", {
      config: { configurable: { model_selection: { ...model, apiKey: "" } } },
    });
    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
  });
});
