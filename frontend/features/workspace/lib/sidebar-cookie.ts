import type { CookieDefinition } from "@/lib/cookies/types";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

const DEFAULT_SIDEBAR_COLLAPSED = true;

export const sidebarCollapsedCookie = {
  name: "assistant_sidebar_collapsed",
  defaultValue: DEFAULT_SIDEBAR_COLLAPSED,
  maxAge: ONE_YEAR_IN_SECONDS,

  parse(value) {
    if (value === "true") return true;
    if (value === "false") return false;

    return DEFAULT_SIDEBAR_COLLAPSED;
  },

  serialize(value) {
    return String(value);
  },
} satisfies CookieDefinition<boolean>;
