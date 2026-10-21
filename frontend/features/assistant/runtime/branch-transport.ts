export type BranchSelection = { checkpointId: string };

const storageKey = (threadId: string) => `assistant-branch:${threadId}`;

export function readBranchSelection(threadId: string): BranchSelection | undefined {
  try {
    const checkpointId = sessionStorage.getItem(storageKey(threadId));
    return checkpointId ? { checkpointId } : undefined;
  } catch {
    return undefined;
  }
}

export function saveBranchSelection(threadId: string, selection?: BranchSelection) {
  try {
    if (selection) sessionStorage.setItem(storageKey(threadId), selection.checkpointId);
    else sessionStorage.removeItem(storageKey(threadId));
  } catch {
    // Storage may be disabled; the in-memory selection still works for this visit.
  }
}

export function createBranchFetch(
  next: typeof fetch,
  getSelection: (threadId: string) => BranchSelection | undefined,
  onRunAccepted: (threadId: string) => void,
): typeof fetch {
  return async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      window.location.href,
    );
    if (url.origin !== window.location.origin) return next(input, init);
    const thread = url.pathname.match(/\/threads\/([^/]+)\//)?.[1];
    if (!thread) return next(input, init);
    const threadId = decodeURIComponent(thread);
    const selection = getSelection(threadId);
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    if (selection && method === "GET" && url.pathname.endsWith("/state")) {
      url.pathname += `/${encodeURIComponent(selection.checkpointId)}`;
      const response = await next(input instanceof Request ? new Request(url, input) : url, init);
      // The SDK treats 404 as a missing thread and would display an empty new chat.
      if (response.status === 404) {
        await response.body?.cancel();
        return Response.json(
          { error: "The selected branch checkpoint is no longer available." },
          { status: 409 },
        );
      }
      return response;
    }
    if (method !== "POST" || typeof init?.body !== "string") return next(input, init);
    let payload;
    try {
      payload = JSON.parse(init.body);
    } catch {
      return next(input, init);
    }
    const isRun =
      payload.method === "run.start" || /\/runs(?:\/(?:stream|wait))?$/.test(url.pathname);
    if (!isRun) return next(input, init);
    const request = payload.method === "run.start" ? (payload.params ??= {}) : payload;
    if (
      selection &&
      !request.checkpoint &&
      !request.checkpoint_id &&
      !request.config?.configurable?.checkpoint_id
    ) {
      request.config = {
        ...request.config,
        configurable: { ...request.config?.configurable, checkpoint_id: selection.checkpointId },
      };
    }
    const response = await next(input, { ...init, body: JSON.stringify(payload) });
    if (response.ok) onRunAccepted(threadId);
    return response;
  };
}
