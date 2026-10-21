import { unstable_convertExternalMessages, type ThreadMessage } from "@assistant-ui/react";
import {
  convertLangChainBaseMessage,
  type LangChainBaseMessage,
} from "@assistant-ui/react-langchain";
import type { Client, ThreadState } from "@langchain/langgraph-sdk";

export type BranchState = ThreadState<Record<string, unknown>>;
export type BranchEntry = { message: ThreadMessage; parentId: string | null };
export type BranchHistory = {
  entries: BranchEntry[];
  checkpoints: Map<string, BranchState>;
  originalIds: Map<string, string>;
};

export async function loadBranchHistory(client: Client, threadId: string): Promise<BranchState[]> {
  const states = new Map<string, BranchState>();
  let before: { configurable: { checkpoint_id: string } } | undefined;
  for (;;) {
    const page: BranchState[] = await client.threads.getHistory(threadId, { limit: 100, before });
    const previousSize = states.size;
    for (const state of page) {
      if (state.checkpoint.checkpoint_id) states.set(state.checkpoint.checkpoint_id, state);
    }
    const oldest = page.at(-1)?.checkpoint.checkpoint_id;
    if (page.length < 100) return [...states.values()];
    if (!oldest || previousSize === states.size)
      throw new Error(
        "Conversation history pagination did not advance. Reopen this thread to retry.",
      );
    before = { configurable: { checkpoint_id: oldest } };
  }
}

export function convertBranchMessages(state: BranchState): ThreadMessage[] {
  const messages = state.values.messages;
  if (!Array.isArray(messages)) return [];
  return unstable_convertExternalMessages(
    messages as LangChainBaseMessage[],
    convertLangChainBaseMessage,
    false,
    {},
  );
}

// Include parent and content so checkpoint edits that reuse a message id stay distinct.
export function branchMessageKey(message: ThreadMessage, parentId: string | null): string {
  return JSON.stringify([parentId, message.id, message.role, message.content]);
}

export function buildBranchHistory(states: BranchState[]): BranchHistory {
  const parents = new Set(states.flatMap((state) => state.parent_checkpoint?.checkpoint_id ?? []));
  const leaves = states.filter((state) => !parents.has(state.checkpoint.checkpoint_id ?? ""));
  const entries = new Map<string, BranchEntry>();
  const identities = new Map<string, string>();
  const checkpoints = new Map<string, BranchState>();
  const originalIds = new Map<string, string>();
  const order = new Map(
    states.map((state, index) => [state.checkpoint.checkpoint_id, states.length - index]),
  );
  const byId = new Map(states.map((state) => [state.checkpoint.checkpoint_id, state]));
  const ancestry = (state: BranchState) => {
    const ranks: number[] = [];
    const seen = new Set<string>();
    let current: BranchState | undefined = state;
    while (current?.checkpoint.checkpoint_id && !seen.has(current.checkpoint.checkpoint_id)) {
      seen.add(current.checkpoint.checkpoint_id);
      ranks.push(order.get(current.checkpoint.checkpoint_id)!);
      current = byId.get(current.parent_checkpoint?.checkpoint_id);
    }
    return ranks.reverse();
  };
  // Order by the original fork, so extending an old branch does not renumber it.
  leaves.sort((left, right) => {
    const a = ancestry(left);
    const b = ancestry(right);
    for (let index = 0; index < Math.min(a.length, b.length); index++) {
      if (a[index] !== b[index]) return a[index]! - b[index]!;
    }
    return a.length - b.length;
  });
  for (const state of leaves) {
    let parentId: string | null = null;
    for (const message of convertBranchMessages(state)) {
      const key = branchMessageKey(message, parentId);
      let id = identities.get(key);
      if (!id) {
        id = message.id;
        for (let version = 1; entries.has(id); version++) id = `${message.id}:branch:${version}`;
        identities.set(key, id);
        entries.set(id, { message: { ...message, id }, parentId });
        originalIds.set(id, message.id);
      }
      parentId = id;
    }
    if (parentId) {
      const previous = checkpoints.get(parentId);
      if (
        !previous ||
        order.get(state.checkpoint.checkpoint_id)! > order.get(previous.checkpoint.checkpoint_id)!
      )
        checkpoints.set(parentId, state);
    }
  }
  return { entries: [...entries.values()], checkpoints, originalIds };
}

export function matchBranchPath(
  history: BranchHistory,
  messages: readonly ThreadMessage[],
): string[] {
  let parentId: string | null = null;
  return messages.map((message) => {
    const entry = history.entries.find(
      (entry) =>
        entry.parentId === parentId &&
        history.originalIds.get(entry.message.id) === message.id &&
        JSON.stringify(entry.message.content) === JSON.stringify(message.content),
    );
    parentId = entry?.message.id ?? message.id;
    return parentId;
  });
}
