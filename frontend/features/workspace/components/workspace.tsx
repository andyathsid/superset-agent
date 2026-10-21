"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDownIcon, PlugIcon } from "lucide-react";
import { AssistantSidebar } from "@/features/assistant/components/assistant-sidebar";
import { McpServerPanel } from "@/features/mcp/components/mcp-server-panel";
import { useMcpServerStatus } from "@/features/mcp/hooks/use-mcp-server-status";
import { writeClientCookie } from "@/lib/cookies/client";
import { sidebarCollapsedCookie } from "../lib/sidebar-cookie";

type WorkspaceProps = {
  children: ReactNode;
  defaultSidebarCollapsed: boolean;
};

export function Workspace({ children, defaultSidebarCollapsed }: WorkspaceProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [expandedServerId, setExpandedServerId] = useState<string>();
  const [isMcpPanelOpen, setMcpPanelOpen] = useState(false);
  const { servers } = useMcpServerStatus({ pollEnabled: isMcpPanelOpen });

  return (
    <AppShell
      title="Superset MCP Chatbot"
      defaultCollapsed={defaultSidebarCollapsed}
      onCollapsedChange={(collapsed) => writeClientCookie(sidebarCollapsedCookie, collapsed)}
      headerActions={
        <Popover open={isMcpPanelOpen} onOpenChange={setMcpPanelOpen}>
          <PopoverTrigger
            render={
              <Button variant="outline" className="group h-9 gap-2 rounded-full px-3">
                <PlugIcon className="size-4" />
                <span>MCP Connection Status</span>
                <ChevronDownIcon className="text-muted-foreground size-3.5 transition-transform duration-200 group-aria-expanded:rotate-180 motion-reduce:transition-none" />
              </Button>
            }
          />
          <PopoverContent
            align="end"
            sideOffset={8}
            className="max-h-[70dvh] w-68 max-w-[calc(100vw-1.5rem)] gap-0 overflow-y-auto rounded-2xl p-0"
          >
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <PopoverTitle className="text-sm font-medium">MCP Servers</PopoverTitle>
              <span className="text-muted-foreground text-xs tabular-nums">
                {servers.length} {servers.length === 1 ? "server" : "servers"}
              </span>
            </div>
            {servers.length === 0 && (
              <p className="text-muted-foreground px-4 py-5 text-sm">No server status available.</p>
            )}
            <McpServerPanel
              servers={servers}
              expandedId={expandedServerId}
              open
              showTrigger={false}
              onToggle={(id) => setExpandedServerId((current) => (current === id ? undefined : id))}
              className="border-0 bg-transparent dark:bg-transparent"
            />
          </PopoverContent>
        </Popover>
      }
      sidebar={({ collapsed, closeMobileSidebar }) => (
        <AssistantSidebar
          collapsed={collapsed}
          onNavigate={() => {
            closeMobileSidebar();
            if (pathname !== "/") router.push("/");
          }}
        />
      )}
    >
      {children}
    </AppShell>
  );
}
