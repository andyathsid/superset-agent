import { createStore } from "zustand/vanilla";
import type { Client } from "@langchain/langgraph-sdk";
import { defaultModelId } from "../config/models";

export type ThreadModelState = {
  modelId: string;
  ready: boolean;
  busy: boolean;
  error?: string;
};

export const newThreadModel: ThreadModelState = {
  modelId: defaultModelId,
  ready: true,
  busy: false,
};
const unloaded: ThreadModelState = { ...newThreadModel, ready: false };

export function getThreadModel(
  states: ReadonlyMap<string, ThreadModelState>,
  id: string,
  remote: boolean,
): ThreadModelState {
  return states.get(id) ?? (remote ? unloaded : newThreadModel);
}

type ThreadModels = {
  states: ReadonlyMap<string, ThreadModelState>;
  get: (id: string, remote: boolean) => ThreadModelState;
  load: (id: string) => Promise<void>;
  select: (id: string, modelId: string, remote: boolean) => Promise<void>;
  initialize: (localId: string) => Promise<{ remoteId: string; externalId: string }>;
  forRun: (id: string) => Promise<string>;
};

export type ThreadModelStore = ReturnType<typeof createThreadModelStore>;

export function createThreadModelStore(client: Client) {
  const pending = new Map<string, Promise<void>>();
  return createStore<ThreadModels>()((set, get) => {
    function setThread(id: string, state: ThreadModelState) {
      set((current) => ({ states: new Map(current.states).set(id, state) }));
    }

    return {
      states: new Map(),
      get: (id, remote) => getThreadModel(get().states, id, remote),
      load(id) {
        const existing = pending.get(id);
        if (existing) return existing;
        const operation = client.threads
          .get(id)
          .then(
            (thread) => {
              const saved = thread.metadata?.selected_model_id;
              setThread(id, {
                modelId: typeof saved === "string" && saved ? saved : defaultModelId,
                ready: true,
                busy: false,
              });
            },
            () => {
              setThread(id, {
                ...get().get(id, true),
                ready: false,
                busy: false,
                error: "Could not load this thread's model. Retry before sending a message.",
              });
            },
          )
          .finally(() => pending.delete(id));
        pending.set(id, operation);
        setThread(id, { ...get().get(id, true), ready: false, busy: true, error: undefined });
        return operation;
      },

      select(id, modelId, remote) {
        const current = get().get(id, remote);
        if (!current.ready || current.busy || current.modelId === modelId) return Promise.resolve();
        if (!remote) {
          setThread(id, { modelId, ready: true, busy: false });
          return Promise.resolve();
        }
        const operation = client.threads
          .update(id, {
            metadata: { selected_model_id: modelId },
          })
          .then(
            () => setThread(id, { modelId, ready: true, busy: false }),
            () =>
              setThread(id, {
                ...current,
                error: "Could not save the model selection. Your previous model is still selected.",
              }),
          )
          .finally(() => pending.delete(id));
        pending.set(id, operation);
        setThread(id, { modelId, ready: true, busy: true });
        return operation;
      },

      async initialize(localId) {
        const { modelId } = get().get(localId, false);
        const thread = await client.threads.create({ metadata: { selected_model_id: modelId } });
        setThread(thread.thread_id, { modelId, ready: true, busy: false });
        return { remoteId: thread.thread_id, externalId: thread.thread_id };
      },

      async forRun(id) {
        if (!get().states.has(id)) await get().load(id);
        await pending.get(id);
        const state = get().get(id, true);
        if (!state.ready) throw new Error(state.error ?? "The thread's model is not ready.");
        return state.modelId;
      },
    };
  });
}
