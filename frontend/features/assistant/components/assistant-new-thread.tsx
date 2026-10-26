"use client";

import { ThreadListNew } from "./assistant-ui/elements/thread-list.aui";

type AssistantNewThreadProps = {
  onNavigate: () => void;
};

export function AssistantNewThread({ onNavigate }: AssistantNewThreadProps) {
  return (
    <ThreadListNew
      className="w-full gap-2 overflow-hidden px-2.5 has-[>svg]:px-2.5"
      onClick={onNavigate}
    />
  );
}
