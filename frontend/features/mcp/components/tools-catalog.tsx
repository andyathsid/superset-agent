"use client";

import { useState } from "react";
import { BookOpenIcon, ChevronDownIcon, PlugIcon, SearchIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CollapsibleContent,
  CollapsibleRoot,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { OpenMetadataLogo, SupersetLogo } from "@/features/workspace/components/logos";
import { useMcpServerStatus } from "../hooks/use-mcp-server-status";
import { useToolCatalog } from "../hooks/use-tool-catalog";
import type { McpServer } from "../types/mcp-server";
import type { CatalogConnection, CatalogTool } from "../types/tool-catalog";
import { ToolDescription, ToolParameters } from "./tool-documentation";

const collapsibleContentClassName = [
  "h-(--collapsible-panel-height) overflow-hidden opacity-100",
  "transition-[height,opacity] duration-200 ease-out",
  "data-[starting-style]:h-0 data-[starting-style]:opacity-0",
  "data-[ending-style]:h-0 data-[ending-style]:opacity-0",
  "motion-reduce:transition-none",
].join(" ");

export function ToolsCatalog() {
  const { servers, isLoading, error } = useMcpServerStatus({
    pollEnabled: false,
  });
  const orderedServers = [...servers].sort(
    (first, second) => Number(second.id === "openmetadata") - Number(first.id === "openmetadata"),
  );

  return (
    <section aria-labelledby="tools-catalog-title" className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pt-16 pb-10 md:px-8 md:pt-10 animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out motion-reduce:animate-none">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <BookOpenIcon aria-hidden className="size-5" />
            <h1 id="tools-catalog-title" className="text-2xl font-semibold tracking-tight">
              Tools Catalog
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Browse tools by MCP connection. Open a tool to view its description and parameters.
          </p>
        </header>
        <div className="flex flex-col gap-6" aria-busy={isLoading}>
          {isLoading && (
            <div role="status">
              <span className="sr-only">Loading MCP connections…</span>
              <Skeleton
                aria-hidden="true"
                className="h-24 w-full rounded-xl motion-reduce:animate-none"
              />
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error} Reload the page to retry.
            </p>
          )}
          {!isLoading && !error && servers.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No MCP connections configured</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
          {orderedServers.map((server, index) => (
            <ServerToolsCatalog
              key={server.id}
              server={server}
              defaultOpen={index === orderedServers.length - 1}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ServerToolsCatalog({
  server,
  defaultOpen,
}: {
  server: Pick<McpServer, "id" | "name">;
  defaultOpen: boolean;
}) {
  const { state, retry } = useToolCatalog(server.id);
  const connection: CatalogConnection | null =
    state.status === "success"
      ? {
          server_id: state.data.server_id,
          name: server.name,
          description:
            server.id === "superset"
              ? "Explore dashboards, charts, and SQL analytics."
              : "Search data assets, metadata, and lineage.",
          tools: state.data.tools,
        }
      : null;

  return (
    <div
      className="flex flex-col gap-6"
      aria-label={`${server.name} tools catalog`}
      aria-busy={state.status === "loading"}
    >
      {state.status === "loading" && (
        <div role="status">
          <span className="sr-only">Loading {server.name} tools catalog…</span>
          <div
            aria-hidden="true"
            className="rounded-xl border motion-reduce:[&_[data-slot=skeleton]]:animate-none"
          >
            <div className="flex items-center gap-3 p-4 md:p-5">
              <Skeleton className="size-10 shrink-0 rounded-lg" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-full max-w-64" />
              </div>
              <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
            </div>
            <Separator className="h-px w-full" />
            <div className="flex flex-col gap-4 p-4 md:p-5">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 w-full sm:w-48" />
              </div>
              <Skeleton className="my-1.5 h-4 w-32" />
              <div className="divide-y rounded-lg border">
                {[0, 1, 2, 3, 4].map((row) => (
                  <div key={row} className="flex items-center gap-3 px-3 py-3">
                    <Skeleton className="size-4 shrink-0" />
                    <Skeleton className="h-4 w-40 max-w-full flex-1 sm:flex-none" />
                    <Skeleton className="ml-auto h-5 w-16 shrink-0 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {state.status === "error" && (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-sm text-destructive">
            {server.name}: {state.message}
          </p>
          <Button
            variant="outline"
            onClick={retry}
            aria-label={`Retry ${server.name} tools catalog`}
          >
            Retry
          </Button>
        </div>
      )}

      {connection && (
        <ConnectionCatalog
          key={connection.server_id}
          connection={connection}
          defaultOpen={defaultOpen}
        />
      )}
    </div>
  );
}

function ConnectionCatalog({
  connection,
  defaultOpen,
}: {
  connection: CatalogConnection;
  defaultOpen: boolean;
}) {
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const categories = [
    "All",
    ...Array.from(new Set(connection.tools.map((tool) => tool.category))).sort(),
  ];
  const query = search.trim().toLowerCase();
  const tools = connection.tools
    .filter(
      (tool) =>
        (category === "All" || tool.category === category) &&
        (tool.name.toLowerCase().includes(query) || tool.description.toLowerCase().includes(query)),
    )
    .sort(
      (first, second) =>
        first.category.localeCompare(second.category, "en") ||
        first.name.localeCompare(second.name, "en"),
    );
  const Icon =
    connection.server_id === "superset"
      ? SupersetLogo
      : connection.server_id === "openmetadata"
        ? OpenMetadataLogo
        : PlugIcon;
  const resetFilters = () => {
    setCategory("All");
    setSearch("");
  };

  return (
    <CollapsibleRoot
      defaultOpen={defaultOpen}
      className="min-w-0 rounded-xl border animate-in fade-in duration-200 motion-reduce:animate-none"
      render={<section aria-label={`${connection.name} tools`} />}
    >
      <h2>
        <CollapsibleTrigger className="group/connection flex w-full items-center gap-3 rounded-xl p-4 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 md:p-5 [&_svg]:shrink-0">
          <span className="text-foreground flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
            <Icon aria-hidden className="size-7" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-medium">{connection.name}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {connection.description}
            </span>
          </span>
          <Badge className="self-center" variant="outline">
            {connection.tools.length} tools
          </Badge>
          <ChevronDownIcon
            aria-hidden
            className="size-4 transition-transform group-aria-expanded/connection:rotate-180 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent keepMounted className={collapsibleContentClassName}>
        <Separator className="h-px w-full" />
        <div className="flex min-w-0 flex-col gap-4 p-4 md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <InputGroup className="flex-1">
              <InputGroupAddon>
                <SearchIcon aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                aria-label={`Search ${connection.name} tools`}
                placeholder="Search tools by name or description…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    aria-label={`Clear ${connection.name} search`}
                    size="icon-xs"
                    onClick={() => setSearch("")}
                  >
                    <XIcon aria-hidden />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </InputGroup>
            <Select value={category} onValueChange={(value) => setCategory(value ?? "All")}>
              <SelectTrigger
                aria-label={`Filter ${connection.name} category`}
                className="w-full sm:w-48"
              >
                <SelectValue>{category === "All" ? "All categories" : category}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {categories.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name === "All" ? "All categories" : name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-h-7 items-center justify-between gap-3">
            <p role="status" className="text-xs text-muted-foreground">
              Showing {tools.length} of {connection.tools.length} tools
            </p>
            {(search || category !== "All") && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Reset filters
              </Button>
            )}
          </div>
          {connection.tools.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No tools available</EmptyTitle>
                <EmptyDescription>This MCP connection returned an empty catalog.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : tools.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchIcon aria-hidden />
                </EmptyMedia>
                <EmptyTitle>No tools found</EmptyTitle>
                <EmptyDescription>
                  Try another search or reset the category filter.
                </EmptyDescription>
              </EmptyHeader>
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Clear filters
              </Button>
            </Empty>
          ) : (
            <div className="flex min-w-0 flex-col divide-y rounded-lg border">
              {tools.map((tool) => (
                <ToolDetails key={tool.name} tool={tool} />
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </CollapsibleRoot>
  );
}

function ToolDetails({ tool }: { tool: CatalogTool }) {
  return (
    <CollapsibleRoot>
      <h3>
        <CollapsibleTrigger className="group/tool flex w-full items-center gap-3 rounded-md px-3 py-3 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0">
          <ChevronDownIcon
            aria-hidden
            className="text-muted-foreground transition-transform group-aria-expanded/tool:rotate-180 motion-reduce:transition-none"
          />
          <span className="min-w-0 flex-1 break-all font-mono text-xs">{tool.name}</span>
          <Badge variant="secondary">{tool.category}</Badge>
        </CollapsibleTrigger>
      </h3>
      <CollapsibleContent className={collapsibleContentClassName}>
        <div className="flex min-w-0 flex-col gap-6 px-4 pt-2 pb-5 sm:pl-10">
          <ToolDescription text={tool.description} summary />
          <ToolParameters schema={tool.input_schema} toolName={tool.name} />
        </div>
      </CollapsibleContent>
    </CollapsibleRoot>
  );
}
