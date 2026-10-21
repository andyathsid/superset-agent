"use client";

import { useMemo } from "react";
import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import { useStreamRuntime } from "@assistant-ui/react-langchain";
import { Client } from "@langchain/langgraph-sdk";
import { createLangGraphThreadListAdapter } from "../runtime/langgraph-thread-list-adapter";

export function useAssistantRuntime() {
  const apiUrl =
    process.env.NEXT_PUBLIC_LANGGRAPH_API_URL ||
    (typeof window !== "undefined" ? new URL("/api", window.location.href).href : undefined);

  const client = useMemo(() => new Client({ apiUrl }), [apiUrl]);

  const threadListAdapter = useMemo<RemoteThreadListAdapter>(
    () => createLangGraphThreadListAdapter(client),
    [client],
  );

  const runtime = useStreamRuntime({
    assistantId: process.env.NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID!,
    apiUrl,
    unstable_threadListAdapter: threadListAdapter,
  });

  return runtime;
}
