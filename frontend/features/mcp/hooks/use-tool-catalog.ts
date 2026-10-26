"use client";

import { useEffect, useState } from "react";
import type { McpToolCatalogResponse } from "../types/tool-catalog";

type CatalogState =
  | { status: "loading" }
  | { status: "success"; data: McpToolCatalogResponse }
  | { status: "error"; message: string };

function getErrorMessage(body: unknown): string | null {
  if (
    typeof body !== "object" ||
    body === null ||
    !("detail" in body)
  ) {
    return null;
  }

  const detail = body.detail;

  if (
    typeof detail === "object" &&
    detail !== null &&
    "message" in detail &&
    typeof detail.message === "string"
  ) {
    return detail.message;
  }

  return null;
}

export function useToolCatalog() {
  const [state, setState] = useState<CatalogState>({
    status: "loading",
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCatalog() {
      try {
        const response = await fetch(
          "/api/mcp-servers/superset/tools",
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null);

          throw new Error(
            getErrorMessage(body) ??
              "Could not load the tools catalog. Please try again.",
          );
        }

        const data: McpToolCatalogResponse = await response.json();

        if (controller.signal.aborted) return;

        setState({ status: "success", data });
      } catch (error) {
        if (controller.signal.aborted) return;

        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not load the tools catalog.",
        });
      }
    }

    void loadCatalog();

    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setState({ status: "loading" });
    setAttempt((current) => current + 1);
  }

  return { state, retry };
}
