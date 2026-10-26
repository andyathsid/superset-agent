"use client";

import type { ReactNode } from "react";
import { BookOpenIcon, FlaskConicalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

type WorkspaceNavigationProps = {
  children: ReactNode;
};

export function WorkspaceNavigation({ children }: WorkspaceNavigationProps) {
  const handleClick = (label: string) => {
    if (label === "Tools Playground") {
      toast.add({
        title: "Not Implemented",
        description: "Sorry, this feature is not yet implemented.",
        type: "info",
      });
    }
  };

  return (
    <nav aria-label="Main menu" className="flex flex-col gap-0.5">
      {children}
      {[
        { label: "Tools Catalog", icon: BookOpenIcon },
        { label: "Tools Playground", icon: FlaskConicalIcon },
      ].map(({ label, icon: Icon }) => (
        <Button
          key={label}
          type="button"
          variant="ghost"
          aria-label={label}
          onClick={handleClick.bind(null, label)}
          className="hover:bg-muted h-8 w-full justify-start gap-2 overflow-hidden rounded-md px-2.5 text-sm font-normal has-[>svg]:px-2.5"
        >
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{label}</span>
        </Button>
      ))}
    </nav>
  );
}
