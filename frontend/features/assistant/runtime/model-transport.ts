import type { RunModel } from "./model-config";

// Both ordinary submit and checkpoint-based retry pass through this transport.
export function createModelFetch(
  getModel: () => RunModel,
  beforeRun?: (
    threadId: string,
    request: Record<string, unknown>,
    model: RunModel,
  ) => Promise<void>,
): typeof fetch {
  return async (input, init) => {
    if (init?.method?.toUpperCase() !== "POST" || typeof init.body !== "string")
      return fetch(input, init);
    let payload;
    try {
      payload = JSON.parse(init.body);
    } catch {
      return fetch(input, init);
    }
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      window.location.href,
    );
    const isCommand = payload.method === "run.start" || payload.method === "input.respond";
    const isRun = /\/(?:threads\/[^/]+\/)?runs(?:\/(?:stream|wait))?$/.test(url.pathname);
    if (url.origin !== window.location.origin || (!isCommand && !isRun)) return fetch(input, init);
    const request = isCommand ? (payload.params ??= {}) : payload;
    const model = getModel();
    const threadId = url.pathname.match(/\/threads\/([^/]+)\//)?.[1];
    if (threadId && beforeRun && payload.method !== "input.respond")
      await beforeRun(decodeURIComponent(threadId), request, model);
    request.model_selection = model;
    request.metadata = { ...request.metadata, ui_model_id: model.id, ui_model_name: model.name };
    return fetch(input, { ...init, body: JSON.stringify(payload) });
  };
}
