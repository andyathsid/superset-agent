"use client";

import { useAuiState } from "@assistant-ui/react";
import { ChevronDownIcon, MessagesSquareIcon } from "lucide-react";
import { useState, type MouseEvent } from "react";
import {
  CollapsibleContent,
  CollapsibleRoot,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ThreadListItems,
  ThreadListRoot,
  ThreadListSearch,
} from "./assistant-ui/elements/thread-list.aui";

type AssistantThreadsSectionProps = {
  onNavigate: () => void;
};

export function AssistantThreadsSection({ onNavigate }: AssistantThreadsSectionProps) {
  const [search, setSearch] = useState("");
  const [threadsOpen, setThreadsOpen] = useState(true);
  const hasThreads = useAuiState((s) => s.threads.threadIds.length > 0);

  const handleNavigation = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-slot="aui_thread-list-item-trigger"]')) {
      onNavigate();
    }
  };

  return (
    <CollapsibleRoot open={threadsOpen} onOpenChange={setThreadsOpen} onClick={handleNavigation}>
      <CollapsibleTrigger className="group/threads flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0">
        <MessagesSquareIcon aria-hidden data-icon="inline-start" />
        <span className="flex-1 text-start">Threads</span>
        <ChevronDownIcon
          aria-hidden
          data-icon="inline-end"
          className="transition-transform group-aria-expanded/threads:rotate-180 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      <CollapsibleContent
        className="
          h-(--collapsible-panel-height) overflow-hidden opacity-100
          transition-[height,opacity] duration-200 ease-out
          data-[starting-style]:h-0 data-[starting-style]:opacity-0
          data-[ending-style]:h-0 data-[ending-style]:opacity-0
          motion-reduce:transition-none
        "
      >
        <ThreadListRoot className="pt-2">
          {hasThreads && <ThreadListSearch value={search} onValueChange={setSearch} />}
          <ThreadListItems searchQuery={hasThreads ? search : ""} />
        </ThreadListRoot>
      </CollapsibleContent>
    </CollapsibleRoot>
  );
}
