import "client-only";

import { serializeCookie } from "cookie-es";
import type { CookieDefinition } from "./types";

export function writeClientCookie<T>(definition: CookieDefinition<T>, value: T): void {
  document.cookie = serializeCookie(definition.name, definition.serialize(value), {
    path: "/",
    maxAge: definition.maxAge,
    sameSite: "lax",
    secure: window.location.protocol === "https:",
  });
}
