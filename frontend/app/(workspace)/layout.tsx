import type { ReactNode } from "react";
import { AssistantProvider } from "@/features/assistant/components/assistant-provider";
import { Workspace } from "@/features/workspace/components/workspace";
import { sidebarCollapsedCookie } from "@/features/workspace/lib/sidebar-cookie";
import { readServerCookie } from "@/lib/cookies/server";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const defaultSidebarCollapsed = await readServerCookie(sidebarCollapsedCookie);

  return (
    <main className="h-dvh">
      <AssistantProvider>
        <Workspace defaultSidebarCollapsed={defaultSidebarCollapsed}>{children}</Workspace>
      </AssistantProvider>
    </main>
  );
}
