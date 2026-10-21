"use client";

import { useAuiState } from "@assistant-ui/react";
import { useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import {
  ThreadListItems,
  ThreadListNew,
  ThreadListRoot,
  ThreadListSearch,
} from "./assistant-ui/elements/thread-list.aui";

type AssistantSidebarProps = {
  collapsed: boolean;
  onNavigate: () => void;
};

export function AssistantSidebar({ collapsed, onNavigate }: AssistantSidebarProps) {
  const [search, setSearch] = useState("");
  const hasThreads = useAuiState((s) => s.threads.threadIds.length > 0);

  const handleNavigation = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return;
    if (
      event.target.closest(
        '[data-slot="aui_thread-list-item-trigger"], [data-slot="aui_thread-list-new"]',
      )
    ) {
      onNavigate();
    }
  };

  return (
    <ThreadListRoot onClick={handleNavigation}>
      <ThreadListNew
        className={cn(
          "overflow-hidden transition-all duration-200",
          collapsed ? "w-8 gap-0 px-2 has-[>svg]:px-2" : "w-full gap-2 px-2.5 has-[>svg]:px-2.5",
        )}
        labelClassName={cn(
          "overflow-hidden transition-all duration-200",
          collapsed ? "max-w-0 opacity-0" : "max-w-24 opacity-100",
        )}
      />
      {hasThreads && (
        <div
          aria-hidden={collapsed}
          inert={collapsed}
          className={cn(
            "transition-opacity duration-150",
            collapsed && "pointer-events-none opacity-0",
          )}
        >
          <ThreadListSearch value={search} onValueChange={setSearch} />
        </div>
      )}
      <ThreadListItems
        searchQuery={hasThreads ? search : ""}
        aria-hidden={collapsed}
        inert={collapsed}
        className={cn(
          "transition-[opacity,transform] duration-150",
          collapsed ? "pointer-events-none opacity-0" : "translate-x-0 opacity-100",
        )}
      />
    </ThreadListRoot>
  );
}
