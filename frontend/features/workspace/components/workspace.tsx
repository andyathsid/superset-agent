"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AssistantSidebar } from "@/features/assistant/components/assistant-sidebar";
import { McpServerPanel } from "@/features/mcp/components/mcp-server-panel";
import { useMcpServerStatus } from "@/features/mcp/hooks/use-mcp-server-status";
import { writeClientCookie } from "@/lib/cookies/client";
import { cn } from "@/lib/utils";
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
      sidebar={({ collapsed, closeMobileSidebar }) => (
        <>
          <div
            aria-hidden={collapsed}
            inert={collapsed}
            className={cn(
              "py-2 transition-opacity duration-150",
              collapsed && "pointer-events-none opacity-0",
            )}
          >
            <McpServerPanel
              servers={servers}
              expandedId={expandedServerId}
              open={isMcpPanelOpen}
              onOpenChange={setMcpPanelOpen}
              onToggle={(id) => setExpandedServerId((current) => (current === id ? undefined : id))}
            />
          </div>
          <AssistantSidebar
            collapsed={collapsed}
            onNavigate={() => {
              closeMobileSidebar();
              if (pathname !== "/") router.push("/");
            }}
          />
        </>
      )}
    >
      {children}
    </AppShell>
  );
}
