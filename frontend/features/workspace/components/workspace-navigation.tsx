"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BookOpenIcon, FlaskConicalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type WorkspaceNavigationProps = {
  children: ReactNode;
  collapsed: boolean;
  onToolsCatalogNavigate?: () => void;
  onToolsPlaygroundNavigate?: () => void;
};

export function WorkspaceNavigation({
  children,
  collapsed,
  onToolsCatalogNavigate,
  onToolsPlaygroundNavigate,
}: WorkspaceNavigationProps) {
  const pathname = usePathname();

  const handleClick = (label: string) => {
    if (label === "Tools Catalog") {
      onToolsCatalogNavigate?.();
      return;
    }
    if (label === "Tools Playground") {
      onToolsPlaygroundNavigate?.();
    }
  };

  return (
    <nav aria-label="Main menu" className="flex flex-col gap-0.5">
      {children}
      {[
        { label: "Tools Catalog", icon: BookOpenIcon, href: "/tools-catalog" },
        { label: "Tools Playground", icon: FlaskConicalIcon, href: "/tools-playground" },
      ].map(({ label, icon: Icon, href }) => (
        <Button
          key={label}
          type="button"
          variant="ghost"
          aria-label={label}
          title={collapsed ? label : undefined}
          data-active={pathname === href ? "true" : undefined}
          aria-current={pathname === href ? "page" : undefined}
          onClick={handleClick.bind(null, label)}
          className={cn(
            "hover:bg-muted data-active:bg-muted h-8 justify-start overflow-hidden rounded-md text-sm font-normal transition-[width,padding,gap] duration-200 motion-reduce:transition-none",
            collapsed ? "w-8 gap-0 px-2 has-[>svg]:px-2" : "w-full gap-2 px-2.5 has-[>svg]:px-2.5",
          )}
        >
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          <span
            className={cn(
              "truncate transition-opacity duration-200 motion-reduce:transition-none",
              collapsed ? "opacity-0" : "opacity-100",
            )}
          >
            {label}
          </span>
        </Button>
      ))}
    </nav>
  );
}
