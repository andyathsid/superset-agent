"use client";

import { Thread } from "./assistant-ui/elements/thread.aui";
import { AssistantModelSelector } from "./assistant-model-selector";

export function Assistant() {
  return <Thread composerActions={<AssistantModelSelector />} />;
}
