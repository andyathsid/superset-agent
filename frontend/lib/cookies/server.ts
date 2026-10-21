import "server-only";

import { cookies } from "next/headers";
import type { CookieDefinition } from "./types";

export async function readServerCookie<T>(definition: CookieDefinition<T>): Promise<T> {
  const cookieStore = await cookies();
  const storedValue = cookieStore.get(definition.name)?.value;

  return definition.parse(storedValue);
}
