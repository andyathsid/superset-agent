"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import type { ReactNode } from "react";
import { assistantConfig } from "../config/suggestions";
import { useAssistantRuntime } from "../hooks/use-assistant-runtime";

export function AssistantProvider({ children }: { children: ReactNode }) {
  const runtime = useAssistantRuntime();

  return (
    <AssistantRuntimeProvider runtime={runtime} config={assistantConfig}>
      {children}
    </AssistantRuntimeProvider>
  );
}
