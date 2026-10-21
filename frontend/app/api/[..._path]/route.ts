import { type NextRequest, NextResponse } from "next/server";
import { OPENROUTER_TESTING_MODEL } from "@/app/lib/assistant/model-config";

export const runtime = "nodejs";

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

type LangGraphRunRequest = {
  config?: {
    configurable?: {
      model_name?: unknown;
      model_base_url?: unknown;
      model_api_key?: unknown;
    };
  };
};

type LangGraphCommandRequest = LangGraphRunRequest & {
  method?: unknown;
  params?: LangGraphRunRequest;
};

function isAllowedRequestContext(req: NextRequest) {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite !== null) {
    return fetchSite === "same-origin" || fetchSite === "none";
  }

  const origin = req.headers.get("origin");
  if (origin === null) return true;

  try {
    return new URL(origin).origin === req.nextUrl.origin;
  } catch {
    return false;
  }
}

function crossOriginResponse() {
  return NextResponse.json(
    { error: "Cross-origin requests are not allowed." },
    { status: 403 },
  );
}

async function handleRequest(req: NextRequest, method: string) {
  if (!isAllowedRequestContext(req)) return crossOriginResponse();

  try {
    const apiUrl = process.env.LANGGRAPH_API_URL?.trim();
    if (!apiUrl) {
      return NextResponse.json(
        { error: "LANGGRAPH_API_URL is not configured." },
        { status: 503 },
      );
    }

    const path = req.nextUrl.pathname.replace(/^\/?api\//, "");
    const searchParams = new URLSearchParams(req.nextUrl.search);
    searchParams.delete("_path");
    searchParams.delete("nxtP_path");
    const queryString = searchParams.toString()
      ? `?${searchParams.toString()}`
      : "";

    const headers = new Headers();
    const apiKey = process.env.LANGCHAIN_API_KEY?.trim();
    if (apiKey) headers.set("x-api-key", apiKey);

    const accept = req.headers.get("accept");
    if (accept) headers.set("accept", accept);

    const contentType = req.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);

    const options: RequestInit = {
      method,
      headers,
      redirect: "manual",
      signal: req.signal,
    };

    if (["POST", "PUT", "PATCH"].includes(method)) {
      let body = await req.text();

      if (contentType?.includes("application/json")) {
        try {
          const payload = JSON.parse(body) as LangGraphCommandRequest;
          // Agent Protocol commands wrap run configuration in `params`.
          const runRequest =
            payload.method === "run.start" || payload.method === "input.respond"
              ? payload.params
              : payload;
          const configurable = runRequest?.config?.configurable;

          if (
            configurable?.model_name === OPENROUTER_TESTING_MODEL.name &&
            configurable.model_base_url === OPENROUTER_TESTING_MODEL.baseUrl
          ) {
            const testingApiKey = process.env.OPENROUTER_TESTING_API_KEY?.trim();

            if (!testingApiKey) {
              return NextResponse.json(
                { error: "OPENROUTER_TESTING_API_KEY is not configured." },
                { status: 503 },
              );
            }

            configurable.model_api_key = testingApiKey;
            body = JSON.stringify(payload);
          }
        } catch {
          // Forward malformed JSON unchanged so LangGraph can report it.
        }
      }

      options.body = body;
    }

    const res = await fetch(`${apiUrl}/${path}${queryString}`, options);

    if (
      res.status === 0 ||
      (res.status >= 300 && res.status < 400 && res.status !== 304) ||
      res.type === "opaqueredirect"
    ) {
      await res.body?.cancel().catch(() => undefined);
      return NextResponse.json(
        { error: "LangGraph returned an unexpected redirect." },
        { status: 502 },
      );
    }

    const responseHeaders = new Headers(res.headers);
    for (const name of [
      "access-control-allow-credentials",
      "access-control-allow-headers",
      "access-control-allow-methods",
      "access-control-allow-origin",
      "content-encoding",
      "content-length",
      "set-cookie",
      "transfer-encoding",
    ]) {
      responseHeaders.delete(name);
    }
    responseHeaders.set("Cache-Control", "no-store");

    return new NextResponse(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });
  } catch (e: unknown) {
    if (e instanceof Error) {
      const typedError = e as Error & { status?: number };
      return NextResponse.json(
        { error: typedError.message },
        { status: typedError.status ?? 500 },
      );
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}

export const GET = (req: NextRequest) => handleRequest(req, "GET");
export const POST = (req: NextRequest) => handleRequest(req, "POST");
export const PUT = (req: NextRequest) => handleRequest(req, "PUT");
export const PATCH = (req: NextRequest) => handleRequest(req, "PATCH");
export const DELETE = (req: NextRequest) => handleRequest(req, "DELETE");
export const OPTIONS = (req: NextRequest) =>
  isAllowedRequestContext(req)
    ? new NextResponse(null, {
        status: 204,
        headers: { Allow: ALLOWED_METHODS },
      })
    : crossOriginResponse();
