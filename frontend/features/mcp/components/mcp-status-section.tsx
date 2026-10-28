"use client";

import { useState } from "react";
import { ChevronDownIcon, PlugIcon } from "lucide-react";
import {
  CollapsibleContent,
  CollapsibleRoot,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { OpenMetadataLogo, SupersetLogo } from "@/features/workspace/components/logos";
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

const mcpServerOrder: Record<string, number> = {
  openmetadata: 0,
  superset: 1,
};

export function McpStatusSection({ collapsed }: McpStatusSectionProps) {
  const [mcpStatusOpen, setMcpStatusOpen] = useState(true);
  const { servers, isLoading, error } = useMcpServerStatus({
    pollEnabled: !collapsed && mcpStatusOpen,
  });
  const orderedServers = [...servers].sort(
    (a, b) => (mcpServerOrder[a.id] ?? 2) - (mcpServerOrder[b.id] ?? 2),
  );

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
        aria-busy={isLoading}
        className="
          h-(--collapsible-panel-height) overflow-hidden opacity-100
          transition-[height,opacity] duration-200 ease-out
          data-[starting-style]:h-0 data-[starting-style]:opacity-0
          data-[ending-style]:h-0 data-[ending-style]:opacity-0
          motion-reduce:transition-none
        "
      >
        {isLoading && (
          <div role="status" className="px-0.5 pt-2">
            <span className="sr-only">Checking MCP connections…</span>
            <div
              aria-hidden="true"
              className="flex min-w-0 items-center gap-2.5 px-2.5 py-2 motion-reduce:[&_[data-slot=skeleton]]:animate-none"
            >
              <Skeleton className="size-5 shrink-0 rounded" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-24 max-w-full" />
                <Skeleton className="h-2.5 w-full" />
              </div>
              <Skeleton className="size-3 shrink-0 rounded" />
            </div>
          </div>
        )}
        {error && (
          <p role="status" className="text-muted-foreground px-3 py-2 text-xs">
            {error} {servers.length > 0 && "Showing last known status."}
          </p>
        )}
        {!isLoading && !error && servers.length === 0 && (
          <p className="text-muted-foreground px-3 py-2 text-xs">No MCP servers configured.</p>
        )}
        <ul className="flex min-w-0 flex-col gap-0.5 pt-1">
          {orderedServers.map(({ id, name, url, tool_count, transport, status, checkedAt }) => {
            const Icon =
              id === "superset"
                ? SupersetLogo
                : id === "openmetadata"
                  ? OpenMetadataLogo
                  : PlugIcon;
            return (
              <CollapsibleRoot key={id} render={<li />} className="min-w-0 rounded-lg">
                <CollapsibleTrigger className="group/mcp-server hover:bg-muted/50 grid w-full min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_0.75rem] items-center gap-x-2.5 gap-y-0.5 rounded-lg px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none [&_svg]:shrink-0">
                  <span className="text-foreground flex size-5 shrink-0 items-center justify-center">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <span className="truncate text-xs leading-4 font-medium">{name}</span>
                  <ChevronDownIcon
                    aria-hidden
                    className="text-muted-foreground/60 size-3 transition-transform group-aria-expanded/mcp-server:rotate-180 motion-reduce:transition-none"
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 justify-self-center rounded-full",
                      mcpStatusDots[status],
                    )}
                  />
                  <span className="text-muted-foreground col-span-2 flex flex-wrap items-center gap-x-1.5 text-[10px] leading-3.5">
                    <span>{mcpStatusLabels[status]}</span>
                    <span aria-hidden>·</span>
                    <span>{transport}</span>
                    <span aria-hidden>·</span>
                    <span className="whitespace-nowrap">
                      {tool_count == null ? "Tools unavailable" : `${tool_count} tools`}
                    </span>
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden opacity-100 transition-[height,opacity] duration-200 ease-out data-[starting-style]:h-0 data-[starting-style]:opacity-0 data-[ending-style]:h-0 data-[ending-style]:opacity-0 motion-reduce:transition-none">
                  <dl className="bg-muted/50 mx-2.5 mt-1 mb-2 flex min-w-0 flex-col gap-3 rounded-lg p-2.5">
                    <div className="flex min-w-0 flex-col gap-1">
                      <dt className="text-muted-foreground text-[10px] font-medium">MCP URL</dt>
                      <dd className="min-w-0 text-[11px] leading-relaxed">
                        {url ? (
                          <code className="select-text break-all">{url}</code>
                        ) : (
                          <span className="text-muted-foreground">URL belum diatur</span>
                        )}
                      </dd>
                    </div>
                    {checkedAt && (
                      <div className="flex min-w-0 flex-col gap-1">
                        <dt className="text-muted-foreground text-[10px] font-medium">
                          Last checked
                        </dt>
                        <dd className="text-[11px] leading-relaxed">
                          <time dateTime={checkedAt}>{new Date(checkedAt).toLocaleString()}</time>
                        </dd>
                      </div>
                    )}
                  </dl>
                </CollapsibleContent>
              </CollapsibleRoot>
            );
          })}
        </ul>
      </CollapsibleContent>
    </CollapsibleRoot>
  );
}
