"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  useExternalStoreRuntime,
  useAuiState,
  useRemoteThreadListRuntime,
  type AppendMessage,
  type RemoteThreadListAdapter,
  type ThreadMessage,
} from "@assistant-ui/react";
import { useStreamRuntime, type UseStreamRuntimeOptions } from "@assistant-ui/react-langchain";
import { getMessageContent } from "@assistant-ui/react-langchain/converter";
import { STREAM_CONTROLLER, type AnyStream } from "@langchain/react";
import { Client } from "@langchain/langgraph-sdk";
import {
  buildBranchHistory,
  convertBranchMessages,
  loadBranchHistory,
  matchBranchPath,
  type BranchState,
} from "./branch-history";
import {
  createBranchFetch,
  readBranchSelection,
  saveBranchSelection,
  type BranchSelection,
} from "./branch-transport";

type Options = UseStreamRuntimeOptions & { unstable_threadListAdapter: RemoteThreadListAdapter };
const EMPTY_STATES: BranchState[] = [];

function useBranchThreadRuntime(options: Options) {
  const [selections] = useState(() => new Map<string, BranchSelection | undefined>());
  const branchFetch = useMemo(
    () =>
      createBranchFetch(
        options.fetch ?? fetch,
        (threadId) => {
          if (!selections.has(threadId)) selections.set(threadId, readBranchSelection(threadId));
          return selections.get(threadId);
        },
        (threadId) => {
          selections.set(threadId, undefined);
          saveBranchSelection(threadId);
        },
      ),
    [options.fetch, selections],
  );
  const client = useMemo(
    () =>
      new Client({
        apiUrl: options.apiUrl,
        callerOptions: { ...options.callerOptions, fetch: branchFetch },
      }),
    [options.apiUrl, options.callerOptions, branchFetch],
  );
  const base = useStreamRuntime(Object.assign({}, options, { client, fetch: branchFetch }));
  const snapshot = useSyncExternalStore(
    base.thread.subscribe,
    base.thread.getState,
    base.thread.getState,
  );
  const stream = (snapshot.extras as { stream?: AnyStream } | undefined)?.stream;
  const externalId = useAuiState((s) => s.threadListItem.externalId);
  const threadId = externalId ?? stream?.threadId;
  const [loaded, setLoaded] = useState<{ threadId: string; states: BranchState[] }>();
  const [liveThreadId, setLiveThreadId] = useState<string>();
  const states = loaded && loaded.threadId === threadId ? loaded.states : EMPTY_STATES;
  const history = useMemo(() => buildBranchHistory(states), [states]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [reload, setReload] = useState(0);
  const operation = useRef(false);
  const active = useRef(threadId);
  active.current = threadId;

  useEffect(() => {
    if (threadId && snapshot.isRunning) setLiveThreadId(threadId);
  }, [threadId, snapshot.isRunning]);

  useEffect(() => {
    if (!stream || !threadId || snapshot.isRunning || snapshot.isLoading || operation.current)
      return;
    let disposed = false;
    loadBranchHistory(stream.client, threadId)
      .then((next) => {
        if (disposed) return;
        setLoaded({ threadId, states: next });
        setError(undefined);
      })
      .catch(() => {
        if (!disposed) setError("Could not load conversation branches. Retry to load them.");
      });
    return () => {
      disposed = true;
    };
  }, [stream?.client, threadId, snapshot.isRunning, snapshot.isLoading, reload]);

  // A new thread gets its ID during the first run, before branch history can load.
  // Keep its live messages visible through the run and the subsequent history fetch.
  const ready =
    !threadId || loaded?.threadId === threadId || snapshot.isRunning || liveThreadId === threadId;
  const visibleMessages = ready || error ? snapshot.messages : [];
  const path = matchBranchPath(history, visibleMessages);
  const messages = useMemo(
    () => visibleMessages.map((message, index) => ({ ...message, id: path[index]! })),
    [snapshot.messages, ready, error, JSON.stringify(path)],
  );
  const selected = history.checkpoints.get(path.at(-1) ?? "");

  useEffect(() => {
    if (
      !threadId ||
      !selected ||
      snapshot.isRunning ||
      snapshot.isLoading ||
      busy ||
      operation.current
    )
      return;
    const selection = { checkpointId: selected.checkpoint.checkpoint_id! };
    selections.set(threadId, selection);
    saveBranchSelection(threadId, selection);
  }, [threadId, selected, snapshot.isRunning, snapshot.isLoading, busy, selections]);

  const switchBranch = async (nextMessages: readonly ThreadMessage[]) => {
    if (!stream || !threadId || snapshot.isRunning || operation.current) return;
    const target = history.checkpoints.get(nextMessages.at(-1)?.id ?? "");
    if (!target?.checkpoint.checkpoint_id) {
      setError("This branch has no saved checkpoint. Reopen this thread to retry.");
      return;
    }
    operation.current = true;
    setBusy(true);
    setError(undefined);
    const previous = selections.get(threadId);
    selections.set(threadId, { checkpointId: target.checkpoint.checkpoint_id });
    try {
      // A reset drops message assemblers and replay guards from the previous branch.
      await stream[STREAM_CONTROLLER].hydrate(null);
      await stream[STREAM_CONTROLLER].hydrate(threadId);
      const failure = stream[STREAM_CONTROLLER].rootStore.getSnapshot().error;
      if (failure) throw failure;
      saveBranchSelection(threadId, selections.get(threadId));
    } catch {
      selections.set(threadId, previous);
      saveBranchSelection(threadId, previous);
      await stream[STREAM_CONTROLLER].hydrate(null);
      await stream[STREAM_CONTROLLER].hydrate(threadId);
      setError(
        "Could not switch branches. The previous branch was restored. Reopen this thread to retry.",
      );
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };

  const fork = async (
    parentId: string | null,
    message?: AppendMessage,
    runConfig?: AppendMessage["runConfig"],
  ) => {
    if (!stream || !threadId || operation.current || snapshot.isRunning) return;
    operation.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const parentIndex =
        parentId === null ? -1 : messages.findIndex((item) => item.id === parentId);
      if (parentId !== null && parentIndex < 0) throw new Error("Unknown parent message");
      const prefix = messages.slice(0, parentIndex + 1);
      const byId = new Map(states.map((state) => [state.checkpoint.checkpoint_id, state]));
      let candidate = selected;
      let checkpoint: BranchState | undefined;
      const seen = new Set<string>();
      while (candidate?.checkpoint.checkpoint_id && !seen.has(candidate.checkpoint.checkpoint_id)) {
        seen.add(candidate.checkpoint.checkpoint_id);
        const ids = matchBranchPath(history, convertBranchMessages(candidate));
        if (ids.length === prefix.length && ids.every((id, index) => id === prefix[index]?.id)) {
          checkpoint = candidate;
          break;
        }
        candidate = byId.get(candidate.parent_checkpoint?.checkpoint_id);
      }
      if (!checkpoint?.checkpoint.checkpoint_id) throw new Error("Checkpoint unavailable");
      await stream.submit(
        message ? { messages: [{ type: "human", content: getMessageContent(message) }] } : null,
        {
          forkFrom: checkpoint.checkpoint.checkpoint_id,
          ...(runConfig?.custom ? { config: { configurable: runConfig.custom } } : {}),
        },
      );
    } catch {
      setError(
        "Could not run from this branch. Check the connection and reopen this thread to retry.",
      );
    } finally {
      operation.current = false;
      setBusy(false);
      // submit can settle without toggling isRunning on a rejected request.
      if (active.current === threadId) {
        loadBranchHistory(stream.client, threadId)
          .then((next) => {
            if (active.current === threadId) setLoaded({ threadId, states: next });
          })
          .catch(() => setError("Could not refresh conversation branches. Retry to load them."));
      }
    }
  };

  const hydrationFailed =
    !!stream?.error && snapshot.messages.length === 0 && !!threadId && !!selections.get(threadId);
  const branchError =
    error ??
    (hydrationFailed
      ? "Could not load the selected branch. Select another thread or retry."
      : undefined);

  // Preserve the adapter's non-enumerable brand for useLangChainStream/useLangChainError.
  const extras = useMemo(
    () =>
      Object.assign(Object.create(snapshot.extras ?? null), {
        branchError,
        retryBranches: () => {
          setError(undefined);
          setReload((value) => value + 1);
          if (hydrationFailed && stream && threadId)
            void stream[STREAM_CONTROLLER].hydrate(threadId);
        },
      }),
    [snapshot.extras, branchError, hydrationFailed, stream, threadId],
  );
  const repository = useMemo(() => {
    if (hydrationFailed) return { messages: [], headId: null };
    const entries = new Map(history.entries.map((entry) => [entry.message.id, entry]));
    messages.forEach((message, index) =>
      entries.set(message.id, { message, parentId: messages[index - 1]?.id ?? null }),
    );
    return { messages: [...entries.values()], headId: messages.at(-1)?.id ?? null };
  }, [history, messages, hydrationFailed]);

  return useExternalStoreRuntime({
    messages,
    messageRepository: repository,
    isRunning: snapshot.isRunning || busy,
    isLoading: snapshot.isLoading || (!ready && !error),
    isDisabled: snapshot.isDisabled || busy || !ready || hydrationFailed,
    extras,
    suggestions: snapshot.suggestions,
    unstable_persistsHistory: true,
    setMessages: (next) => {
      void switchBranch(next);
    },
    onNew: async (message) => {
      base.thread.append({
        ...message,
        parentId: history.originalIds.get(message.parentId ?? "") ?? message.parentId,
      });
    },
    onEdit: (message) => fork(message.parentId, message, message.runConfig),
    onReload: (parentId, config) => fork(parentId, undefined, config.runConfig),
    onCancel: async () => {
      base.thread.cancelRun();
    },
  });
}

export function useBranchRuntime(options: Options) {
  return useRemoteThreadListRuntime({
    adapter: options.unstable_threadListAdapter,
    runtimeHook: () => useBranchThreadRuntime(options),
  });
}
