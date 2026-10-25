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

export class ThreadModelStore {
  private states = new Map<string, ThreadModelState>();
  private pending = new Map<string, Promise<void>>();
  private listeners = new Set<() => void>();

  constructor(private client: Client) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get = (id: string, remote: boolean): ThreadModelState =>
    this.states.get(id) ?? (remote ? unloaded : newThreadModel);

  private set(id: string, state: ThreadModelState) {
    this.states.set(id, state);
    for (const listener of this.listeners) listener();
  }

  load(id: string): Promise<void> {
    const pending = this.pending.get(id);
    if (pending) return pending;
    const operation = this.client.threads
      .get(id)
      .then(
        (thread) => {
          const saved = thread.metadata?.selected_model_id;
          this.set(id, {
            modelId: typeof saved === "string" && saved ? saved : defaultModelId,
            ready: true,
            busy: false,
          });
        },
        () => {
          this.set(id, {
            ...this.get(id, true),
            ready: false,
            busy: false,
            error: "Could not load this thread's model. Retry before sending a message.",
          });
        },
      )
      .finally(() => this.pending.delete(id));
    this.pending.set(id, operation);
    this.set(id, { ...this.get(id, true), ready: false, busy: true, error: undefined });
    return operation;
  }

  select(id: string, modelId: string, remote: boolean): Promise<void> {
    const current = this.get(id, remote);
    if (!current.ready || current.busy || current.modelId === modelId) return Promise.resolve();
    if (!remote) {
      this.set(id, { modelId, ready: true, busy: false });
      return Promise.resolve();
    }
    const operation = this.client.threads
      .update(id, {
        metadata: { selected_model_id: modelId },
      })
      .then(
        () => this.set(id, { modelId, ready: true, busy: false }),
        () =>
          this.set(id, {
            ...current,
            error: "Could not save the model selection. Your previous model is still selected.",
          }),
      )
      .finally(() => this.pending.delete(id));
    this.pending.set(id, operation);
    this.set(id, { modelId, ready: true, busy: true });
    return operation;
  }

  async initialize(localId: string) {
    const { modelId } = this.get(localId, false);
    const thread = await this.client.threads.create({ metadata: { selected_model_id: modelId } });
    this.set(thread.thread_id, { modelId, ready: true, busy: false });
    return { remoteId: thread.thread_id, externalId: thread.thread_id };
  }

  async forRun(id: string): Promise<string> {
    if (!this.states.has(id)) await this.load(id);
    await this.pending.get(id);
    const state = this.get(id, true);
    if (!state.ready) throw new Error(state.error ?? "The thread's model is not ready.");
    return state.modelId;
  }

  async saveForRun(id: string, modelId: string): Promise<void> {
    await this.pending.get(id);
    const current = this.get(id, true);
    if (!current.ready) throw new Error(current.error ?? "The thread's model is not ready.");
    let failed = false;
    const error = "Could not save the model selection. The message was not sent. Retry sending.";
    const operation = this.client.threads
      .update(id, { metadata: { selected_model_id: modelId } })
      .then(
        () => this.set(id, { ...current, busy: false, error: undefined }),
        () => {
          failed = true;
          this.set(id, { ...current, busy: false, error });
        },
      )
      .finally(() => this.pending.delete(id));
    this.pending.set(id, operation);
    this.set(id, { ...current, busy: true, error: undefined });
    await operation;
    if (failed) throw new Error(error);
  }
}
