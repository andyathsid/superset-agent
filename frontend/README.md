# Frontend

Next.js routes, layouts, global styles, and API handlers live in `app/`.
Routes under `app/(workspace)/` share the workspace layout. The route group does
not add a URL segment, so the assistant remains at `/`. Add future workspace
pages inside this group and use Next.js `Link` for client navigation.

The workspace layout mounts `AssistantProvider` once around `Workspace` and the
current page. The runtime, sidebar state, and MCP polling survive navigation
between workspace routes. Page-local state can reset when its page unmounts.

Assistant code lives in `features/assistant/`:

- `components/`: assistant content, runtime provider, and thread sidebar.
- `components/assistant-ui/`: assistant-ui elements and their supporting utilities.
- `hooks/`: runtime setup and attachments.
- `runtime/`: LangGraph thread list adapter.
- `config/`: welcome suggestions.

The runtime uses the same-origin `/api` proxy. Model ID and base URL are fixed in
`app/api/[..._path]/route.ts`; the API key comes from the server-only
`OPENROUTER_TESTING_API_KEY` environment variable. The proxy supplies model
configuration through the backend execution context for each run and resume.

`features/mcp/` owns the server panel, status polling hook, and server types.
It does not depend on assistant code. `Workspace` calls the polling hook once
and supplies the same data and open state to desktop and mobile panels.

`features/workspace/` composes the assistant sidebar and MCP panel. It owns the
sidebar cookie definition, retaining the existing cookie name for compatibility.
This composition layer can import other features; assistant and MCP remain
independent of each other.

`components/layout/app-shell.tsx` owns desktop collapse, pointer and keyboard
resize, and the mobile sheet. It accepts a sidebar render function with
`collapsed` and `closeMobileSidebar` controls. Feature sidebar components call
the close callback after navigation. The shell has no assistant or MCP imports.

Shared UI primitives stay in `components/ui/`. Generic hooks and utilities stay
in `hooks/` and `lib/`. Extract assistant code into those shared folders when
another feature needs it. Shared code must not import from `features/` or `app/`.

Keep cookie server and client helpers in separate modules. Import
`lib/cookies/server` only from server code.

## Adding components

Run installation commands from `frontend/`. Keep the default aliases in
`components.json` so other registries do not install into the assistant feature.

For a single-file assistant-ui element such as logos, set its destination:

```sh
npx shadcn@latest add "@assistant-ui/logos" \
  --path features/assistant/components/assistant-ui/elements
```

Review imports after installation. For multi-file items, `--path` can flatten
directories and affect dependency destinations. Check the generated diff and
keep shadcn primitives in `components/ui/` and assistant hooks in the feature.

Install shadcn primitives with the default command:

```sh
npx shadcn@latest add button
```

## Verification

```sh
npx tsc --noEmit --incremental false
npm run lint
npm run build
```
