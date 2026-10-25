"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useAuiState } from "@assistant-ui/react";
import { useLangChainError } from "@assistant-ui/react-langchain";
import { useModels } from "./model-provider";

type ThreadModels = {
  selectedModel: string;
  locked: boolean;
  canSend: boolean;
  selectModel: (id: string) => void;
  error: string | undefined;
  retryLoad: (() => void) | undefined;
};
const ThreadModelContext = createContext<ThreadModels | null>(null);

export function ModelThreadProvider({ children }: { children: ReactNode }) {
  const store = useModels();
  const itemId = useAuiState((s) => s.threadListItem.id);
  const remoteId = useAuiState((s) => s.threadListItem.externalId);
  const running = useAuiState((s) => s.thread.isRunning);
  const loading = useAuiState((s) => s.thread.isLoading);
  const submitting = useAuiState((s) => s.composer.submission !== undefined);
  const id = remoteId ?? itemId;
  const state = useSyncExternalStore(
    store.threadModels.subscribe,
    () => store.threadModels.get(id, !!remoteId),
    () => store.threadModels.get(id, !!remoteId),
  );

  useEffect(() => {
    if (remoteId) void store.threadModels.load(remoteId);
  }, [remoteId, store.threadModels]);

  let unavailable: string | undefined;
  try {
    store.snapshotRef.current(state.modelId);
  } catch (error) {
    unavailable = error instanceof Error ? error.message : "The selected model is unavailable.";
  }
  const locked = running || loading || submitting || state.busy || !state.ready;
  const selectModel = (modelId: string) => {
    if (!locked) void store.threadModels.select(id, modelId, !!remoteId);
  };

  return (
    <ThreadModelContext.Provider
      value={{
        selectedModel: state.modelId,
        locked,
        canSend: !locked && !unavailable,
        selectModel,
        error: state.error ?? unavailable,
        retryLoad:
          remoteId && !state.ready && !state.busy
            ? () => {
                void store.threadModels.load(remoteId);
              }
            : undefined,
      }}
    >
      {children}
    </ThreadModelContext.Provider>
  );
}

export function useThreadModels() {
  const value = useContext(ThreadModelContext);
  if (!value) throw new Error("ModelThreadProvider is required.");
  return value;
}

export function ThreadModelError() {
  const { error, retryLoad } = useThreadModels();
  const runError = useLangChainError();
  // Run failures can precede the first assistant message, so they also need a thread-level outlet.
  const text =
    error ??
    (runError
      ? "Model request failed. Check the model, connection, and API key, then retry."
      : undefined);
  return text ? (
    <p
      role="alert"
      className="my-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
    >
      {text}
      {retryLoad && (
        <button type="button" className="ml-2 underline" onClick={retryLoad}>
          Retry
        </button>
      )}
    </p>
  ) : null;
}
