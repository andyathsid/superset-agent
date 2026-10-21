"use client";

import { useMemo } from "react";
import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import { useBranchRuntime } from "../runtime/use-branch-runtime";
import { Client } from "@langchain/langgraph-sdk";
import { createLangGraphThreadListAdapter } from "../runtime/langgraph-thread-list-adapter";
import { useModels } from "../components/model-provider";
import { createModelFetch } from "../runtime/model-transport";

export function useAssistantRuntime() {
  const { snapshotRef, prepareRunRef } = useModels();
  const modelFetch = useMemo(
    () =>
      createModelFetch(
        () => snapshotRef.current(),
        async (...args) => {
          await prepareRunRef.current?.(...args);
        },
      ),
    [snapshotRef, prepareRunRef],
  );
  const apiUrl =
    typeof window !== "undefined" ? new URL("/api", window.location.href).href : undefined;

  const client = useMemo(() => new Client({ apiUrl }), [apiUrl]);

  const threadListAdapter = useMemo<RemoteThreadListAdapter>(
    () => createLangGraphThreadListAdapter(client),
    [client],
  );

  const runtime = useBranchRuntime({
    assistantId: process.env.NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID!,
    apiUrl,
    fetch: modelFetch,
    unstable_threadListAdapter: threadListAdapter,
  });

  return runtime;
}
