"use client";

import { useShallow } from "zustand/react/shallow";
import { useMemo } from "react";
import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import { useStreamRuntime } from "@assistant-ui/react-langchain";
import { createLangGraphThreadListAdapter } from "../runtime/langgraph-thread-list-adapter";
import { useModels } from "../components/model-provider";
import { createModelFetch } from "../runtime/model-transport";
import { defaultModelId } from "../config/models";

export function useAssistantRuntime() {
  const { snapshot, threadModels, apiUrl, client } = useModels(
    useShallow((state) => ({
      snapshot: state.snapshot,
      threadModels: state.threadModels,
      apiUrl: state.apiUrl,
      client: state.client,
    })),
  );
  const modelFetch = useMemo(
    () =>
      createModelFetch(
        async (threadId) =>
          snapshot(threadId ? await threadModels.getState().forRun(threadId) : defaultModelId),
        (threadId, model) => threadModels.getState().saveForRun(threadId, model.id),
      ),
    [snapshot, threadModels],
  );

  const threadListAdapter = useMemo<RemoteThreadListAdapter>(
    () => createLangGraphThreadListAdapter(client, threadModels),
    [client, threadModels],
  );

  const runtime = useStreamRuntime({
    assistantId: process.env.NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID!,
    apiUrl,
    fetch: modelFetch,
    unstable_threadListAdapter: threadListAdapter,
  });

  return runtime;
}
