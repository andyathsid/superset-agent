"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuiState } from "@assistant-ui/react";
import { useLangChainError, useLangChainStream } from "@assistant-ui/react-langchain";
import { BoxIcon } from "lucide-react";
import { defaultModel } from "../config/models";
import { modelIdentity, type ModelIdentity } from "../runtime/model-config";
import {
  eventIsVisible,
  findModelCheckpoint,
  messageIds,
  readModelEvents,
  saveModelEvent,
  type ModelChangeEvent,
} from "../runtime/model-history";
import { useModels } from "./model-provider";

type ThreadModels = {
  locked: boolean;
  selectModel: (id: string, identity?: ModelIdentity) => void;
  events: ModelChangeEvent[];
  error: string | undefined;
};
const ThreadModelContext = createContext<ThreadModels | null>(null);

export function ModelThreadProvider({ children }: { children: ReactNode }) {
  const store = useModels();
  const stream = useLangChainStream();
  const running = useAuiState((s) => s.thread.isRunning);
  const messages = useAuiState((s) => s.thread.messages);
  const loading = useAuiState((s) => s.thread.isLoading);
  const threadId = stream?.threadId ?? undefined;
  const [eventsByThread, setEventsByThread] = useState<Record<string, ModelChangeEvent[]>>({});
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const pending = useRef(new Map<string, Promise<unknown>>());
  const pendingBindings = useRef(new Map<string, ModelChangeEvent>());
  const eventsRef = useRef(eventsByThread);
  eventsRef.current = eventsByThread;
  const path = stream?.messages.flatMap((message) => (message.id ? [message.id] : [])) ?? [];
  const locked = running || loading;
  const pathKey = JSON.stringify(path);

  useEffect(() => {
    if (locked || !threadId || !stream) return;
    for (const [id, event] of pendingBindings.current) {
      if (event.threadId !== threadId || !eventIsVisible(event, path)) continue;
      const nextId = path[event.messagePath.length];
      if (!nextId) continue;
      pendingBindings.current.delete(id);
      const bound = { ...event, beforeMessageId: nextId };
      setEventsByThread((current) => ({
        ...current,
        [threadId]: (current[threadId] ?? []).map((item) => (item.id === id ? bound : item)),
      }));
      saveModelEvent(stream.client, bound).catch(() =>
        setErrors((current) => ({
          ...current,
          [threadId]: "Could not save the branch reference for a model change.",
        })),
      );
    }
  }, [locked, threadId, pathKey, stream?.client]);

  useEffect(() => {
    if (!threadId || !stream) return;
    let disposed = false;
    stream.client.threads
      .get(threadId)
      .then((thread) => {
        if (disposed) return;
        const saved = readModelEvents(thread.metadata ?? {});
        setEventsByThread((current) => {
          const merged = new Map(saved.map((event) => [event.id, event]));
          for (const event of current[threadId] ?? []) merged.set(event.id, event);
          return {
            ...current,
            [threadId]: [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
          };
        });
      })
      .catch(() => {
        if (!disposed)
          setErrors((current) => ({
            ...current,
            [threadId]: "Could not load model change history. Reopen this thread to retry.",
          }));
      });
    return () => {
      disposed = true;
    };
  }, [threadId, stream?.client]);

  function selectModel(id: string, selectedIdentity?: ModelIdentity) {
    if (locked || id === store.selectedModel) return;
    const identity = (modelId: string): ModelIdentity => {
      const model =
        modelId === defaultModel.id
          ? defaultModel
          : store.allModels.find((item) => item.id === modelId);
      return modelIdentity(model ?? { id: modelId, name: modelId });
    };
    const from = identity(store.selectedModel);
    const to = selectedIdentity ?? identity(id);
    store.setSelectedModel(id);
    if (!threadId || !stream || messages.length === 0) return;
    const event: ModelChangeEvent = {
      id: crypto.randomUUID(),
      threadId,
      afterMessageId: messages.at(-1)?.id ?? null,
      checkpointId: null,
      checkpointNamespace: "",
      messagePath: path,
      from,
      to,
      createdAt: new Date().toISOString(),
    };
    setEventsByThread((current) => ({
      ...current,
      [threadId]: [...(current[threadId] ?? []), event],
    }));
    setErrors((current) => ({ ...current, [threadId]: undefined }));
    const client = stream.client;
    const write = (pending.current.get(threadId) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        const checkpoint = await findModelCheckpoint(client, threadId, event.messagePath);
        if (!checkpoint?.checkpoint_id) throw new Error("No matching checkpoint");
        const saved = {
          ...event,
          checkpointId: checkpoint.checkpoint_id,
          checkpointNamespace: checkpoint.checkpoint_ns,
        };
        await saveModelEvent(client, saved);
        setEventsByThread((current) => ({
          ...current,
          [threadId]: (current[threadId] ?? []).map((item) =>
            item.id === saved.id ? saved : item,
          ),
        }));
      })
      .catch(() => {
        setErrors((current) => ({
          ...current,
          [threadId]:
            "Model selected, but its change history could not be saved. This marker may disappear after reload.",
        }));
      });
    pending.current.set(threadId, write);
  }

  store.prepareRunRef.current = async (runThreadId, request, model) => {
    if (!stream) return;
    await pending.current.get(runThreadId);
    try {
      const config = request.config as { configurable?: { checkpoint_id?: string } } | undefined;
      const state = await stream.client.threads.getState<Record<string, unknown>>(
        runThreadId,
        config?.configurable?.checkpoint_id,
      );
      const basePath = messageIds(state.values);
      if (basePath.length === 0 || !state.checkpoint.checkpoint_id) return;
      const saved = readModelEvents((await stream.client.threads.get(runThreadId)).metadata ?? {});
      const existing = [...saved, ...(eventsRef.current[runThreadId] ?? [])].filter((event) =>
        eventIsVisible(event, basePath),
      );
      const tail = existing
        .filter((event) => event.messagePath.length === basePath.length)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .at(-1);
      if (tail?.to.id === model.id) {
        if (!tail.beforeMessageId) pendingBindings.current.set(tail.id, tail);
        return;
      }
      const raw = state.values.messages as {
        additional_kwargs?: { metadata?: { ui_model?: ModelIdentity } };
      }[];
      const previous = [...raw]
        .reverse()
        .find((message) => message.additional_kwargs?.metadata?.ui_model)?.additional_kwargs
        ?.metadata?.ui_model;
      const lastAssistantIndex = raw.findLastIndex(
        (message) => message.additional_kwargs?.metadata?.ui_model,
      );
      const latestChange = existing
        .filter((event) => event.messagePath.length >= lastAssistantIndex + 1)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .at(-1);
      const from = latestChange?.to ?? previous ?? defaultModel;
      if (from.id === model.id) return;
      const event: ModelChangeEvent = {
        id: crypto.randomUUID(),
        threadId: runThreadId,
        afterMessageId: basePath.at(-1) ?? null,
        checkpointId: state.checkpoint.checkpoint_id,
        checkpointNamespace: state.checkpoint.checkpoint_ns,
        messagePath: basePath,
        from: modelIdentity(from),
        to: modelIdentity(model),
        createdAt: new Date().toISOString(),
      };
      await saveModelEvent(stream.client, event);
      pendingBindings.current.set(event.id, event);
      setEventsByThread((current) => ({
        ...current,
        [runThreadId]: [...(current[runThreadId] ?? []), event],
      }));
    } catch {
      setErrors((current) => ({
        ...current,
        [runThreadId]:
          "Could not save the model change for this run. Its history marker may be missing after reload.",
      }));
    }
  };

  const events = (threadId ? (eventsByThread[threadId] ?? []) : []).filter((event) =>
    eventIsVisible(event, path),
  );
  const error = threadId ? errors[threadId] : undefined;
  return (
    <ThreadModelContext.Provider value={{ locked, selectModel, events, error }}>
      {children}
    </ThreadModelContext.Provider>
  );
}

export function useThreadModels() {
  const value = useContext(ThreadModelContext);
  if (!value) throw new Error("ModelThreadProvider is required.");
  return value;
}

export function ModelChangeMarkers({ afterMessageId }: { afterMessageId: string | null }) {
  const { events } = useThreadModels();
  return events
    .filter((event) => event.afterMessageId === afterMessageId)
    .map((event) => (
      <div
        key={event.id}
        className="my-2 flex items-center gap-3 text-xs text-muted-foreground"
        data-model-change={event.id}
      >
        <span className="h-px flex-1 bg-border" />
        <span className="flex items-center gap-2">
          <BoxIcon className="size-3.5 shrink-0" />
          Model changed from {event.from.name} to {event.to.name}.
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
    ));
}

export function ThreadModelError() {
  const { error } = useThreadModels();
  const runError = useLangChainError();
  const branch = useAuiState(
    (s) => s.thread.extras as { branchError?: string; retryBranches?: () => void } | undefined,
  );
  // Run failures can precede the first assistant message, so they also need a thread-level outlet.
  const text =
    branch?.branchError ??
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
      {branch?.branchError && branch.retryBranches && (
        <button type="button" className="ml-2 underline" onClick={branch.retryBranches}>
          Retry
        </button>
      )}
    </p>
  ) : null;
}

export function MessageModelChangeMarkers() {
  const id = useAuiState((s) => s.message.id);
  return <ModelChangeMarkers afterMessageId={id} />;
}
