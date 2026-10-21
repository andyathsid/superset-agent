"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import type { ReactNode } from "react";
import { assistantConfig } from "../config/suggestions";
import { useAssistantRuntime } from "../hooks/use-assistant-runtime";
import { ModelProvider } from "./model-provider";
import { ModelThreadProvider } from "./model-thread-provider";

export function AssistantProvider({ children }: { children: ReactNode }) {
  return (
    <ModelProvider>
      <RuntimeProvider>{children}</RuntimeProvider>
    </ModelProvider>
  );
}

function RuntimeProvider({ children }: { children: ReactNode }) {
  const runtime = useAssistantRuntime();

  return (
    <AssistantRuntimeProvider runtime={runtime} config={assistantConfig}>
      <ModelThreadProvider>{children}</ModelThreadProvider>
    </AssistantRuntimeProvider>
  );
}
