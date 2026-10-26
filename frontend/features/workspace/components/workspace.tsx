"use client";

import { type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { AssistantNewThread } from "@/features/assistant/components/assistant-new-thread";
import { AssistantThreadsSection } from "@/features/assistant/components/assistant-threads-section";
import { McpStatusSection } from "@/features/mcp/components/mcp-status-section";
import { WorkspaceNavigation } from "./workspace-navigation";
import { writeClientCookie } from "@/lib/cookies/client";
import { sidebarCollapsedCookie } from "../lib/sidebar-cookie";

type WorkspaceProps = {
  children: ReactNode;
  defaultSidebarCollapsed: boolean;
};

export function Workspace({ children, defaultSidebarCollapsed }: WorkspaceProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <AppShell
      title="Superset MCP Chatbot"
      defaultCollapsed={defaultSidebarCollapsed}
      onCollapsedChange={(collapsed) => writeClientCookie(sidebarCollapsedCookie, collapsed)}
      sidebar={({ collapsed, closeMobileSidebar }) => {
        const handleAssistantNavigate = () => {
          closeMobileSidebar();
          if (pathname !== "/") router.push("/");
        };

        return (
          <AppSidebar
            collapsed={collapsed}
            navigation={
              <WorkspaceNavigation
                collapsed={collapsed}
                onToolsCatalogNavigate={() => {
                  closeMobileSidebar();
                  if (pathname !== "/tools-catalog") router.push("/tools-catalog");
                }}
              >
                <AssistantNewThread collapsed={collapsed} onNavigate={handleAssistantNavigate} />
              </WorkspaceNavigation>
            }
          >
            <Separator className="h-px w-full bg-sidebar-border" />
            <McpStatusSection collapsed={collapsed} />
            <Separator className="h-px w-full bg-sidebar-border" />
            <AssistantThreadsSection onNavigate={handleAssistantNavigate} />
          </AppSidebar>
        );
      }}
    >
      {children}
    </AppShell>
  );
}
