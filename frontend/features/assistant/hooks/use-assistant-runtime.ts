"use client";

import { useShallow } from "zustand/react/shallow";
import { useMemo } from "react";
import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import { useStreamRuntime } from "@assistant-ui/react-langchain";
import { createLangGraphThreadListAdapter } from "../runtime/langgraph-thread-list-adapter";
import { useModels } from "../components/model-provider";

export function useAssistantRuntime() {
  const { threadModels, apiUrl, client } = useModels(
    useShallow((state) => ({
      threadModels: state.threadModels,
      apiUrl: state.apiUrl,
      client: state.client,
    })),
  );

  const threadListAdapter = useMemo<RemoteThreadListAdapter>(
    () => createLangGraphThreadListAdapter(client, threadModels),
    [client, threadModels],
  );

  const runtime = useStreamRuntime({
    assistantId: process.env.NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID!,
    apiUrl,
    unstable_threadListAdapter: threadListAdapter,
  });

  return runtime;
}
