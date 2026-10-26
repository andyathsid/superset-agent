"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AppSidebarProps = {
  collapsed: boolean;
  navigation: ReactNode;
  children: ReactNode;
};

export function AppSidebar({ collapsed, navigation, children }: AppSidebarProps) {
  return (
    <div className="flex flex-col gap-4">
      {navigation}
      <div
        inert={collapsed}
        className={cn(
          "flex flex-col gap-4 transition-opacity duration-200 ease-out motion-reduce:transition-none",
          collapsed ? "opacity-0" : "opacity-100",
        )}
      >
        {children}
      </div>
    </div>
  );
}
