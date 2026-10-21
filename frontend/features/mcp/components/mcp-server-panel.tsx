"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type PointerEvent,
} from "react";
import { ChevronDownIcon, ChevronRightIcon, GripHorizontalIcon, PlugIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CollapsibleRoot,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import type { McpServer, McpServerStatus } from "../types/mcp-server";

const paper = "bg-background border border-border/60 dark:bg-popover";
const field = "bg-foreground/[0.04] forced-colors:border dark:bg-foreground/[0.06]";
const mono = "font-mono text-[11px] tracking-tight";

const DOT: Record<McpServerStatus, string> = {
  connected: "bg-emerald-500",
  connecting: "bg-foreground/30 animate-pulse",
  "needs-auth": "bg-amber-500",
  failed: "bg-red-500",
};

const LABEL: Record<McpServerStatus, string> = {
  connected: "connected",
  connecting: "connecting",
  "needs-auth": "needs auth",
  failed: "failed",
};

function formatElapsedTime(value: string): string | undefined {
  const checkedAt = new Date(value);
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - checkedAt.getTime()) / 1_000));

  if (Number.isNaN(checkedAt.getTime())) {
    return undefined;
  }

  if (elapsedSeconds < 10) {
    return "just now";
  }

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s ago`;
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  return `${Math.floor(elapsedMinutes / 60)}h ago`;
}

type McpServerPanelProps = Omit<
  ComponentProps<"div">,
  "children" | "servers" | "expandedId" | "onToggle" | "onAuthorize" | "open" | "onOpenChange"
> & {
  servers: readonly McpServer[];
  expandedId?: string;
  onToggle?: (id: string) => void;
  onAuthorize?: (id: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
};

export function McpServerPanel({
  servers,
  expandedId,
  onToggle,
  onAuthorize,
  open,
  onOpenChange,
  showTrigger = true,
  className,
  ...props
}: McpServerPanelProps) {
  const toolScrollerRef = useRef<HTMLDivElement>(null);
  const connectionDetailsScrollerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    scroller: HTMLDivElement;
  } | null>(null);

  const [showToolsDragHint, setShowToolsDragHint] = useState(false);
  const [showConnectionDetailsDragHint, setShowConnectionDetailsDragHint] = useState(false);

  const updateToolsDragHint = useCallback(() => {
    const scroller = toolScrollerRef.current;
    if (!scroller) return;

    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    const hasOverflow = maxScrollLeft > 1;
    const hasNotReachedEnd = scroller.scrollLeft < maxScrollLeft - 1;

    setShowToolsDragHint(hasOverflow && hasNotReachedEnd);
  }, []);

  const updateConnectionDetailsDragHint = useCallback(() => {
    const scroller = connectionDetailsScrollerRef.current;
    if (!scroller) return;

    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    const hasOverflow = maxScrollLeft > 1;
    const hasNotReachedEnd = scroller.scrollLeft < maxScrollLeft - 1;

    setShowConnectionDetailsDragHint(hasOverflow && hasNotReachedEnd);
  }, []);

  useEffect(() => {
    updateToolsDragHint();
    updateConnectionDetailsDragHint();

    const observer = new ResizeObserver(() => {
      updateToolsDragHint();
      updateConnectionDetailsDragHint();
    });

    for (const scroller of [toolScrollerRef.current, connectionDetailsScrollerRef.current]) {
      if (!scroller) continue;

      observer.observe(scroller);
      if (scroller.firstElementChild) {
        observer.observe(scroller.firstElementChild);
      }
    }

    return () => observer.disconnect();
  }, [expandedId, updateConnectionDetailsDragHint, updateToolsDragHint]);

  const handleScrollerPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;

    const scroller = event.currentTarget;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: scroller.scrollLeft,
      scroller,
    };
    scroller.setPointerCapture(event.pointerId);
  };

  const handleScrollerPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    drag.scroller.scrollLeft = drag.startScrollLeft - (event.clientX - drag.startX);
  };

  const handleScrollerPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const collapsibleState = open === undefined ? { defaultOpen: false } : { open };

  return (
    <CollapsibleRoot
      {...collapsibleState}
      onOpenChange={onOpenChange}
      data-slot="mcp-server-panel"
      className={cn(
        paper,
        "group/mcp-server-panel flex w-full flex-col rounded-2xl p-3",
        className,
      )}
      {...props}
    >
      {showTrigger && (
        <CollapsibleTrigger className="flex items-baseline gap-1 rounded-lg px-1 py-1 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          <span className="text-[13.5px] font-medium">MCP Status</span>

          {/* <span
          className={cn(
            mono,
            "text-muted-foreground min-w-0 flex-1 tabular-nums",
          )}
        >
          {connected} of {servers.length} connected
        </span> */}
          <ChevronDownIcon className="self-center ml-auto text-muted-foreground size-3.5 shrink-0 -rotate-90 transition-transform duration-200 group-data-open/mcp-server-panel:rotate-0 motion-reduce:transition-none" />
        </CollapsibleTrigger>
      )}

      <CollapsibleContent className="overflow-hidden data-closed:animate-collapsible-up data-open:animate-collapsible-down">
        <div className="flex flex-col gap-2 pt-1">
          {servers.map((server) => {
            const expanded = expandedId === server.id;
            const checkedAt = server.checkedAt;
            const lastCheckedLabel = checkedAt ? formatElapsedTime(checkedAt) : undefined;
            const rowClassName = cn(
              "flex items-center gap-2.5 rounded-xl px-1.5 py-2 text-start",
              onToggle && "hover:bg-foreground/[0.04] transition-colors",
            );
            const row = (
              <>
                <ChevronRightIcon
                  className={cn(
                    "text-muted-foreground size-3 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
                    expanded && "rotate-90",
                  )}
                />
                <PlugIcon className="text-muted-foreground size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-[13.5px]">{server.name}</span>
                <span className={cn(mono, "text-muted-foreground shrink-0")}>
                  {server.tools.length} tools
                </span>
                <span
                  aria-hidden
                  className={cn("size-1.5 shrink-0 rounded-full", DOT[server.status])}
                />
                <span className="sr-only">{LABEL[server.status]}</span>
              </>
            );
            return (
              <div key={server.id} className="flex flex-col">
                {onToggle ? (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => onToggle(server.id)}
                    className={rowClassName}
                  >
                    {row}
                  </button>
                ) : (
                  <div className={rowClassName}>{row}</div>
                )}

                {expanded && (
                  <div className="fade-in slide-in-from-top-1 animate-in flex flex-col gap-1.5 px-1.5 ps-8 pb-2 duration-200">
                    <div className="flex items-center gap-2">
                      <div className="relative min-w-0 flex-1">
                        <div
                          ref={connectionDetailsScrollerRef}
                          aria-label={`${server.name} connection details`}
                          tabIndex={0}
                          onScroll={updateConnectionDetailsDragHint}
                          onPointerDown={handleScrollerPointerDown}
                          onPointerMove={handleScrollerPointerMove}
                          onPointerUp={handleScrollerPointerEnd}
                          onPointerCancel={handleScrollerPointerEnd}
                          className="w-full cursor-grab touch-pan-y select-none overflow-x-auto overflow-y-hidden overscroll-x-contain active:cursor-grabbing [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                        >
                          <div className="flex w-max flex-nowrap items-center gap-1">
                            <span className={cn(mono, "text-muted-foreground shrink-0")}>
                              {server.transport}
                            </span>
                            <span className="text-muted-foreground/60 shrink-0">·</span>
                            <span className={cn(mono, "text-muted-foreground shrink-0")}>
                              {LABEL[server.status]}
                            </span>
                            {checkedAt && lastCheckedLabel && (
                              <>
                                <span className="text-muted-foreground/60 shrink-0">·</span>
                                <time
                                  dateTime={checkedAt}
                                  title={new Date(checkedAt).toLocaleString()}
                                  className={cn(mono, "text-muted-foreground shrink-0")}
                                >
                                  last checked {lastCheckedLabel}
                                </time>
                              </>
                            )}
                          </div>
                        </div>
                        {showConnectionDetailsDragHint && (
                          <div
                            aria-hidden
                            className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-end bg-gradient-to-l from-background via-background/80 to-transparent"
                          >
                            <GripHorizontalIcon className="text-muted-foreground/60 size-4" />
                          </div>
                        )}
                      </div>
                      {server.status === "needs-auth" && onAuthorize && (
                        <button
                          type="button"
                          onClick={() => onAuthorize(server.id)}
                          className="ms-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 transition-[background-color,scale] duration-150 hover:bg-amber-500/25 active:scale-[0.96] dark:text-amber-300"
                        >
                          Authorize
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      {/* Scroller tools element */}
                      <div
                        ref={toolScrollerRef}
                        aria-label={`${server.name} tools`}
                        tabIndex={0}
                        onScroll={updateToolsDragHint}
                        onPointerDown={handleScrollerPointerDown}
                        onPointerMove={handleScrollerPointerMove}
                        onPointerUp={handleScrollerPointerEnd}
                        onPointerCancel={handleScrollerPointerEnd}
                        className="w-full cursor-grab touch-pan-y select-none overflow-x-auto overflow-y-hidden overscroll-x-contain pe-1 active:cursor-grabbing [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                      >
                        <div className="flex w-max flex-nowrap gap-1">
                          {server.tools.map((tool) => (
                            <span
                              key={tool}
                              className={cn(
                                field,
                                mono,
                                "text-muted-foreground shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5",
                              )}
                            >
                              {tool}
                            </span>
                          ))}
                        </div>
                      </div>

                      {showToolsDragHint && (
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-end bg-gradient-to-l from-background via-background/80 to-transparent"
                        >
                          <GripHorizontalIcon className="text-muted-foreground/60 size-4" />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </CollapsibleRoot>
  );
}
