"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useStore } from "zustand";
import { useAui, useAuiState, type RunConfig } from "@assistant-ui/react";
import { useLangChainError } from "@assistant-ui/react-langchain";
import { useModels } from "./model-provider";
import { getThreadModel } from "../runtime/thread-model-store";

type ThreadModels = {
  selectedModel: string;
  locked: boolean;
  canSend: boolean;
  selectModel: (id: string) => void;
  error: string | undefined;
  retryLoad: (() => void) | undefined;
  runConfig: RunConfig | undefined;
};
const ThreadModelContext = createContext<ThreadModels | null>(null);

export function ModelThreadProvider({ children }: { children: ReactNode }) {
  const models = useModels((state) => state);
  const { threadModels } = models;
  const aui = useAui();
  const itemId = useAuiState((s) => s.threadListItem.id);
  const remoteId = useAuiState((s) => s.threadListItem.externalId);
  const running = useAuiState((s) => s.thread.isRunning);
  const loading = useAuiState((s) => s.thread.isLoading);
  const submitting = useAuiState((s) => s.composer.submission !== undefined);
  const id = remoteId ?? itemId;
  const state = useStore(threadModels, (store) => getThreadModel(store.states, id, !!remoteId));

  useEffect(() => {
    if (remoteId) void threadModels.getState().load(remoteId);
  }, [remoteId, threadModels]);

  const { runConfig, unavailable } = useMemo(() => {
    try {
      return {
        runConfig: { custom: { model_selection: models.snapshot(state.modelId) } },
        unavailable: undefined,
      };
    } catch (error) {
      return {
        runConfig: undefined,
        unavailable: error instanceof Error ? error.message : "The selected model is unavailable.",
      };
    }
  }, [models, state.modelId]);

  useEffect(() => {
    // Remote runtimes expose an inert placeholder until the thread is attached.
    if (loading) return;
    aui.composer.setRunConfig(runConfig ?? {});
  }, [aui, id, loading, runConfig]);
  const locked = running || loading || submitting || state.busy || !state.ready;
  const selectModel = (modelId: string) => {
    if (!locked) void threadModels.getState().select(id, modelId, !!remoteId);
  };

  return (
    <ThreadModelContext.Provider
      value={{
        selectedModel: state.modelId,
        locked,
        canSend: !locked && !unavailable,
        selectModel,
        error: state.error ?? unavailable,
        runConfig,
        retryLoad:
          remoteId && !state.ready && !state.busy
            ? () => {
                void threadModels.getState().load(remoteId);
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
