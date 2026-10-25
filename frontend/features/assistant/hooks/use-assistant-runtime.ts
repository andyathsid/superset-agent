"use client";

import { useMemo } from "react";
import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import { useStreamRuntime } from "@assistant-ui/react-langchain";
import { createLangGraphThreadListAdapter } from "../runtime/langgraph-thread-list-adapter";
import { useModels } from "../components/model-provider";
import { createModelFetch } from "../runtime/model-transport";
import { defaultModelId } from "../config/models";

export function useAssistantRuntime() {
  const { snapshotRef, threadModels, apiUrl, client } = useModels();
  const modelFetch = useMemo(
    () =>
      createModelFetch(
        async (threadId) =>
          snapshotRef.current(threadId ? await threadModels.forRun(threadId) : defaultModelId),
        (threadId, model) => threadModels.saveForRun(threadId, model.id),
      ),
    [snapshotRef, threadModels],
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
