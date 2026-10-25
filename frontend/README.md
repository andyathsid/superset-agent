# Superset Agent Frontend

A Next.js and React chat interface built with assistant-ui. It supports streamed
responses, tool activity, conversation history, message edits, response branches,
model selection, and Superset MCP connection status.

Requests go through the Next.js `/api` proxy to the
[Aegra backend](../agent/README.md).

## Requirements

- Node.js 22 LTS or newer and npm.
- The agent backend running locally at `http://localhost:2026`.

## Run locally

From the repository root:

```bash
cd frontend
npm ci
```

Copy the example configuration:

```bash
cp .env.example .env.local
```

The default connection values are:

```dotenv
LANGGRAPH_API_URL=http://localhost:2026
NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID=superset_agent
```

These values match the agent in this repository. Set
`LANGCHAIN_API_KEY` only if your backend requires an API key; the proxy forwards
it as `x-api-key`.

```bash
npm run dev
```

Open `http://localhost:3000`. Choose **Default Model** to use the backend's model
configuration, then send a message such as "List the available datasets in
Superset."

## Model selection

Use the model selector in chat composer to choose a provider or add a model. Hosted providers
require an API key. Ollama accepts a local endpoint without a key. Custom models
require an OpenAI-compatible endpoint and an API key. Model endpoints must be
reachable from the backend process.

Provider keys and added models stay in memory for the current session. Reloading
the page clears them.

By default, **Default Model** uses the backend's `MODEL_*` environment variables.
To override it in the Next.js server, set `MODEL_PROVIDER`, `MODEL_NAME`,
`MODEL_BASE_URL`, and `MODEL_API_KEY` in `.env.local`. These variables stay on the
server. `OPENROUTER_TESTING_API_KEY` is also supported as a fallback key for the
server-managed model.

## Project layout

- `app/`: workspace routes, layouts, global styles, and the API proxy.
- `features/assistant/`: chat UI, thread history, model selection, and runtime.
- `features/mcp/`: MCP server status polling and panel.
- `features/workspace/`: workspace layout and feature composition.
- `components/`, `hooks/`, and `lib/`: shared UI, hooks, and utilities.

## Checks and build

Run from `frontend/`:

```bash
npx tsc --noEmit --incremental false
npm run lint
npm run build
```

To serve the production build locally:

```bash
npm start
```
