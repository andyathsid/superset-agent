import { Assistant } from "./assistant";
import { sidebarCollapsedCookie } from "@/app/lib/cookies/definitions";
import { readServerCookie } from "@/app/lib/cookies/server";

export default async function Home() {
  const defaultSidebarCollapsed = await readServerCookie(
    sidebarCollapsedCookie,
  );

  return (
    <main className="h-dvh">
      <Assistant defaultSidebarCollapsed={defaultSidebarCollapsed} />
    </main>
  );
}
