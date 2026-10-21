"use client";

import { TooltipIconButton } from "@/components/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { MenuIcon, PanelLeftIcon } from "lucide-react";
import {
  useRef,
  useState,
  type FC,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

const COLLAPSED_SIDEBAR_WIDTH = 48;
const EXPAND_DRAG_THRESHOLD = COLLAPSED_SIDEBAR_WIDTH + 32;
const DEFAULT_SIDEBAR_WIDTH = 260;
const MIN_SIDEBAR_WIDTH = 220;
const COLLAPSE_DRAG_THRESHOLD = MIN_SIDEBAR_WIDTH - 40;
const MAX_SIDEBAR_WIDTH = 480;
const MIN_CONTENT_WIDTH = 320;
const KEYBOARD_RESIZE_STEP = 16;

const clampSidebarWidth = (width: number) => {
  const availableWidth = window.innerWidth - MIN_CONTENT_WIDTH;
  const maxWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, availableWidth));

  return Math.min(Math.max(width, MIN_SIDEBAR_WIDTH), maxWidth);
};

export type SidebarControls = {
  collapsed: boolean;
  closeMobileSidebar: () => void;
};

type AppShellProps = {
  title: string;
  sidebar: (controls: SidebarControls) => ReactNode;
  children: ReactNode;
  railClassName?: string | undefined;
  defaultCollapsed?: boolean | undefined;
  collapsed?: boolean | undefined;
  onCollapsedChange?: ((value: boolean) => void) | undefined;
  mobileSidebarOpen?: boolean | undefined;
  onMobileSidebarOpenChange?: ((value: boolean) => void) | undefined;
  headerContent?: ReactNode | undefined;
  headerActions?: ReactNode | undefined;
  sheetTitle?: ReactNode | undefined;
};

export const AppShell: FC<AppShellProps> = ({
  children,
  title,
  sidebar,
  railClassName,
  defaultCollapsed = true,
  collapsed,
  onCollapsedChange,
  mobileSidebarOpen,
  onMobileSidebarOpenChange,
  headerContent,
  headerActions,
  sheetTitle,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizeDragRef = useRef<{
    pointerId: number;
    startedCollapsed: boolean;
  } | null>(null);

  // A controlled value means the caller renders the chrome that drives it, so
  // the shell omits its own toggle / trigger and forwards changes instead.
  const collapsedControlled = collapsed !== undefined;
  const mobileControlled = mobileSidebarOpen !== undefined;

  const sidebarCollapsed = collapsed ?? internalCollapsed;
  const mobileOpen = mobileSidebarOpen ?? internalMobileOpen;

  const setSidebarCollapsed = (value: boolean) => {
    if (!collapsedControlled) setInternalCollapsed(value);
    onCollapsedChange?.(value);
  };
  const setMobileOpen = (open: boolean) => {
    if (!mobileControlled) setInternalMobileOpen(open);
    onMobileSidebarOpenChange?.(open);
  };

  const handleResizePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    event.preventDefault();
    resizeDragRef.current = {
      pointerId: event.pointerId,
      startedCollapsed: sidebarCollapsed,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsResizing(true);
  };

  const handleResizePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (resizeDragRef.current?.pointerId !== event.pointerId) return;

    resizeDragRef.current = null;
    setIsResizing(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleResizePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const resizeDrag = resizeDragRef.current;
    if (!resizeDrag || resizeDrag.pointerId !== event.pointerId) return;

    if (resizeDrag.startedCollapsed) {
      if (event.clientX < EXPAND_DRAG_THRESHOLD) return;

      setSidebarWidth(clampSidebarWidth(event.clientX));
      if (sidebarCollapsed) setSidebarCollapsed(false);
      return;
    }

    if (event.clientX <= COLLAPSE_DRAG_THRESHOLD) {
      handleResizePointerEnd(event);
      setSidebarWidth(MIN_SIDEBAR_WIDTH);
      setSidebarCollapsed(true);
      return;
    }

    setSidebarWidth(clampSidebarWidth(event.clientX));
  };

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (sidebarCollapsed) {
      if (event.key !== "ArrowRight" && event.key !== "End") return;

      event.preventDefault();
      setSidebarWidth(
        event.key === "End" ? clampSidebarWidth(MAX_SIDEBAR_WIDTH) : MIN_SIDEBAR_WIDTH,
      );
      setSidebarCollapsed(false);
      return;
    }

    if (event.key === "ArrowLeft" && sidebarWidth <= MIN_SIDEBAR_WIDTH) {
      event.preventDefault();
      setSidebarCollapsed(true);
      return;
    }

    let nextWidth: number;

    switch (event.key) {
      case "ArrowLeft":
        nextWidth = sidebarWidth - KEYBOARD_RESIZE_STEP;
        break;
      case "ArrowRight":
        nextWidth = sidebarWidth + KEYBOARD_RESIZE_STEP;
        break;
      case "Home":
        nextWidth = MIN_SIDEBAR_WIDTH;
        break;
      case "End":
        nextWidth = MAX_SIDEBAR_WIDTH;
        break;
      default:
        return;
    }

    event.preventDefault();
    setSidebarWidth(clampSidebarWidth(nextWidth));
  };

  const closeMobileSidebar = () => setMobileOpen(false);

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      <aside
        className={cn(
          "bg-sidebar relative hidden h-full shrink-0 flex-col overflow-hidden border-r md:flex",
          isResizing ? "select-none" : "transition-[width] duration-200",
          railClassName,
        )}
        style={{
          width: sidebarCollapsed ? COLLAPSED_SIDEBAR_WIDTH : sidebarWidth,
        }}
      >
        <div className="flex h-12 shrink-0 items-center overflow-hidden px-2">
          {!collapsedControlled && (
            <TooltipIconButton
              variant="ghost"
              size="icon"
              tooltip={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
              side="right"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="size-8"
            >
              <PanelLeftIcon className="size-4" />
            </TooltipIconButton>
          )}
          {headerContent !== undefined
            ? headerContent
            : !sidebarCollapsed && (
                <span className="ml-2 truncate text-sm font-medium">{title}</span>
              )}
        </div>

        <div
          className={cn(
            "relative flex flex-1 flex-col gap-0.5 transition-[padding,width] duration-200",
            sidebarCollapsed ? "w-12 overflow-hidden px-2 pt-1" : "w-full overflow-y-auto p-3",
          )}
        >
          {sidebar({ collapsed: sidebarCollapsed, closeMobileSidebar })}
        </div>
      </aside>

      <div
        role="separator"
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Resize sidebar"}
        aria-orientation="vertical"
        aria-valuemin={COLLAPSED_SIDEBAR_WIDTH}
        aria-valuemax={MAX_SIDEBAR_WIDTH}
        aria-valuenow={sidebarCollapsed ? COLLAPSED_SIDEBAR_WIDTH : sidebarWidth}
        tabIndex={0}
        className="absolute inset-y-0 z-20 hidden w-2 -translate-x-1/2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 hover:after:bg-ring focus-visible:after:bg-ring md:block"
        style={{
          left: sidebarCollapsed ? COLLAPSED_SIDEBAR_WIDTH : sidebarWidth,
        }}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerEnd}
        onPointerCancel={handleResizePointerEnd}
        onKeyDown={handleResizeKeyDown}
      />

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        {!mobileControlled && (
          <div className="absolute top-2 left-2 z-20 md:hidden">
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" className="bg-background/70 size-8">
                  <MenuIcon className="size-4" />
                  <span className="sr-only">Open navigation</span>
                </Button>
              }
            />
          </div>
        )}
        <SheetContent side="left" className="bg-sidebar flex flex-col p-0">
          <SheetTitle className="flex h-12 shrink-0 items-center px-4 text-sm font-medium">
            {sheetTitle ?? title}
          </SheetTitle>
          <div className="relative flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
            {sidebar({ collapsed: false, closeMobileSidebar })}
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {headerActions && (
          <header className="flex h-12 shrink-0 items-center justify-end px-3 pl-12 md:px-4">
            {headerActions}
          </header>
        )}
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
};
