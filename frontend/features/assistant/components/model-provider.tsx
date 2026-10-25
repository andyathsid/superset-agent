"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createModelStore, type ModelState } from "../runtime/model-store";

const ModelContext = createContext<ReturnType<typeof createModelStore> | null>(null);

export function ModelProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => {
    const apiUrl =
      typeof window !== "undefined" ? new URL("/api", window.location.href).href : undefined;
    return createModelStore(apiUrl);
  });
  return <ModelContext.Provider value={store}>{children}</ModelContext.Provider>;
}

export function useModels<T>(selector: (state: ModelState) => T): T {
  const store = useContext(ModelContext);
  if (!store) throw new Error("ModelProvider is required.");
  return useStore(store, selector);
}
