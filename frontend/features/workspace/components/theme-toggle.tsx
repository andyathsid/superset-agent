"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { TooltipIconButton } from "@/components/tooltip-icon-button";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = !mounted || resolvedTheme === "dark";
  const label = mounted ? `Switch to ${isDark ? "light" : "dark"} mode` : "Toggle color theme";
  const Icon = isDark ? SunIcon : MoonIcon;
  const toggleTheme = () => setTheme(isDark ? "light" : "dark");

  if (showLabel) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="w-full justify-start"
        disabled={!mounted}
        onClick={toggleTheme}
      >
        <Icon data-icon="inline-start" aria-hidden="true" />
        {label}
      </Button>
    );
  }

  return (
    <TooltipIconButton
      type="button"
      tooltip={label}
      className="size-8"
      disabled={!mounted}
      onClick={toggleTheme}
    >
      <Icon data-icon="inline-start" aria-hidden="true" />
    </TooltipIconButton>
  );
}
