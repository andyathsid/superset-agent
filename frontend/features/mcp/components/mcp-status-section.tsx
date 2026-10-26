"use client";

import { useState } from "react";
import { ChartColumnIcon, ChevronDownIcon, DatabaseIcon, PlugIcon } from "lucide-react";
import {
  CollapsibleContent,
  CollapsibleRoot,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useMcpServerStatus } from "../hooks/use-mcp-server-status";
import type { McpServerStatus } from "../types/mcp-server";

const mcpStatusLabels: Record<McpServerStatus, string> = {
  connected: "Connected",
  connecting: "Connecting",
  "needs-auth": "Needs auth",
  failed: "Failed",
};

const mcpStatusDots: Record<McpServerStatus, string> = {
  connected: "bg-emerald-500",
  connecting: "bg-foreground/30 animate-pulse motion-reduce:animate-none",
  "needs-auth": "bg-amber-500",
  failed: "bg-red-500",
};

type McpStatusSectionProps = {
  collapsed: boolean;
};

export function McpStatusSection({ collapsed }: McpStatusSectionProps) {
  const [mcpStatusOpen, setMcpStatusOpen] = useState(true);
  const { servers, isLoading, error } = useMcpServerStatus({
    pollEnabled: !collapsed && mcpStatusOpen,
  });

  return (
    <CollapsibleRoot
      open={mcpStatusOpen}
      onOpenChange={(open) => {
        if (!collapsed) setMcpStatusOpen(open);
      }}
    >
      <CollapsibleTrigger className="group/mcp-status flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0">
        <PlugIcon aria-hidden data-icon="inline-start" />
        <span className="flex-1 text-start">MCP Connection Status</span>
        <ChevronDownIcon
          aria-hidden
          data-icon="inline-end"
          className="transition-transform group-aria-expanded/mcp-status:rotate-180 motion-reduce:transition-none"
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
        {isLoading && (
          <p role="status" className="text-muted-foreground px-3 py-2 text-xs">
            Checking MCP connections…
          </p>
        )}
        {error && (
          <p role="status" className="text-muted-foreground px-3 py-2 text-xs">
            {error} {servers.length > 0 && "Showing last known status."}
          </p>
        )}
        {!isLoading && !error && servers.length === 0 && (
          <p className="text-muted-foreground px-3 py-2 text-xs">No MCP servers configured.</p>
        )}
        <ul className="flex min-w-0 flex-col gap-2 px-0.5 pt-2">
          {servers.map(({ id, name, url, tools, transport, status, checkedAt }) => {
            const Icon =
              id === "superset" ? ChartColumnIcon : id === "openmetadata" ? DatabaseIcon : PlugIcon;
            return (
              <li
                key={id}
                className="border-sidebar-border flex min-w-0 flex-col gap-3 rounded-xl border p-3"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
                    <Icon aria-hidden className="size-4" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{name}</span>
                    <span className="text-muted-foreground text-[10px]">
                      {mcpStatusLabels[status]} · {transport} · {tools.length} tools
                    </span>
                  </div>
                  <span
                    aria-hidden
                    className={cn("size-1.5 shrink-0 rounded-full", mcpStatusDots[status])}
                  />
                </div>
                <div className="bg-muted/50 flex min-w-0 flex-col gap-1 rounded-md px-2 py-1.5">
                  <span className="text-muted-foreground text-[10px] font-medium">MCP URL</span>
                  {url ? (
                    <code className="select-text text-[11px] leading-relaxed break-all">{url}</code>
                  ) : (
                    <span className="text-muted-foreground text-[11px]">URL belum diatur</span>
                  )}
                </div>

                {checkedAt && (
                  <time dateTime={checkedAt} className="text-muted-foreground text-[10px]">
                    Last checked {new Date(checkedAt).toLocaleString()}
                  </time>
                )}
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </CollapsibleRoot>
  );
}
