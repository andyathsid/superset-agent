"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AppSidebarProps = {
  collapsed: boolean;
  children: ReactNode;
};

export function AppSidebar({ collapsed, children }: AppSidebarProps) {
  return (
    <div
      inert={collapsed}
      className={cn(
        "flex flex-col gap-4 transition-opacity duration-200 ease-out motion-reduce:transition-none",
        collapsed ? "opacity-0" : "opacity-100",
      )}
    >
      {children}
    </div>
  );
}
