"use client";

import { usePathname } from "next/navigation";
import { ThreadListNew } from "./assistant-ui/elements/thread-list.aui";
import { cn } from "@/lib/utils";

type AssistantNewThreadProps = {
  onNavigate: () => void;
  collapsed: boolean;
};

export function AssistantNewThread({ onNavigate, collapsed }: AssistantNewThreadProps) {
  const pathname = usePathname();

  return (
    <ThreadListNew
      highlightActive={pathname === "/"}
      aria-label="New Thread"
      title={collapsed ? "New Thread" : undefined}
      className={cn(
        "overflow-hidden transition-[width,padding,gap] duration-200 motion-reduce:transition-none",
        collapsed ? "w-8 gap-0 px-2 has-[>svg]:px-2" : "w-full gap-2 px-2.5 has-[>svg]:px-2.5",
      )}
      labelClassName={cn(
        "transition-opacity duration-200 motion-reduce:transition-none",
        collapsed ? "opacity-0" : "opacity-100",
      )}
      onClick={onNavigate}
    />
  );
}
