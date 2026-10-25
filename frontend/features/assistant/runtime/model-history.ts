import type { Client, ThreadState } from "@langchain/langgraph-sdk";
import type { ModelIdentity } from "./model-config";

export const MODEL_EVENT_PREFIX = "model_change_";

export function createModelChangeId(): string {
  // getRandomValues also works on HTTP origins where randomUUID is unavailable.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export type ModelChangeEvent = {
  id: string;
  threadId: string;
  afterMessageId: string | null;
  checkpointId: string | null;
  checkpointNamespace: string;
  messagePath: string[];
  beforeMessageId?: string;
  from: ModelIdentity;
  to: ModelIdentity;
  createdAt: string;
};

export function messageIds(values: Record<string, unknown>): string[] {
  const messages = values.messages;
  if (!Array.isArray(messages)) return [];
  return messages.flatMap((message: unknown) =>
    typeof message === "object" &&
    message !== null &&
    "id" in message &&
    typeof message.id === "string"
      ? [message.id]
      : [],
  );
}

export function eventIsVisible(event: ModelChangeEvent, path: readonly string[]) {
  return (
    event.messagePath.length <= path.length &&
    event.messagePath.every((id, index) => id === path[index]) &&
    (!event.beforeMessageId || path[event.messagePath.length] === event.beforeMessageId)
  );
}

export function readModelEvents(metadata: Record<string, unknown>): ModelChangeEvent[] {
  return Object.entries(metadata)
    .flatMap(([key, value]) => {
      if (key.startsWith(MODEL_EVENT_PREFIX) && typeof value === "string") {
        try {
          value = JSON.parse(value);
        } catch {
          return [];
        }
      }
      if (!key.startsWith(MODEL_EVENT_PREFIX) || !value || typeof value !== "object") return [];
      const event = value as Partial<ModelChangeEvent>;
      if (
        typeof event.id !== "string" ||
        typeof event.threadId !== "string" ||
        typeof event.createdAt !== "string" ||
        !Array.isArray(event.messagePath) ||
        !event.messagePath.every((id) => typeof id === "string") ||
        typeof event.from?.id !== "string" ||
        typeof event.from?.name !== "string" ||
        typeof event.to?.id !== "string" ||
        typeof event.to?.name !== "string"
      )
        return [];
      return [event as ModelChangeEvent];
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function findModelCheckpoint(
  client: Client,
  threadId: string,
  path: readonly string[],
) {
  let before: { configurable: { checkpoint_id: string } } | undefined;
  const seen = new Set<string>();
  for (;;) {
    const page: ThreadState<Record<string, unknown>>[] = await client.threads.getHistory<
      Record<string, unknown>
    >(threadId, { limit: 100, before });
    for (const state of page) {
      const ids = messageIds(state.values);
      if (ids.length === path.length && ids.every((id, index) => id === path[index]))
        return state.checkpoint;
    }
    const oldest = page.at(-1)?.checkpoint.checkpoint_id;
    if (page.length < 100 || !oldest || seen.has(oldest)) return null;
    seen.add(oldest);
    before = { configurable: { checkpoint_id: oldest } };
  }
}

export function saveModelEvent(client: Client, event: ModelChangeEvent) {
  // A separate metadata key per event lets the server merge concurrent writes atomically.
  return client.threads.update(event.threadId, {
    metadata: { [`${MODEL_EVENT_PREFIX}${event.id}`]: JSON.stringify(event) },
  });
}
