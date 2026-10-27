"use client";

import { useState } from "react";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  CopyIcon,
  FlaskConicalIcon,
  PlayIcon,
  RotateCcwIcon,
  TerminalIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useMcpServerStatus } from "../hooks/use-mcp-server-status";
import { useToolCatalog } from "../hooks/use-tool-catalog";
import { useToolExecution } from "../hooks/use-tool-execution";
import type { CatalogTool } from "../types/tool-catalog";
import type { McpServer } from "../types/mcp-server";
import {
  defaultArguments,
  parseArguments,
  validateArguments,
  simpleParameters,
} from "../lib/playground-schema";

export function ToolsPlayground() {
  const { servers, isLoading, error } = useMcpServerStatus({ pollEnabled: false });
  const [serverId, setServerId] = useState<string | null>(null);
  const server =
    servers.find((item) => item.id === serverId) ??
    servers.find((item) => item.status === "connected") ??
    servers[0];

  return (
    <section aria-labelledby="tools-playground-title" className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-16 pb-10 md:px-8 md:pt-10 animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <FlaskConicalIcon aria-hidden className="size-5" />
            <h1 id="tools-playground-title" className="text-2xl font-semibold tracking-tight">
              Tools Playground
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Choose a tool, set its arguments, and inspect the result.
          </p>
        </header>

        {isLoading && <PlaygroundSkeleton label="Loading MCP servers…" />}
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Could not load MCP servers</AlertTitle>
            <AlertDescription>{error} Reload the page to retry.</AlertDescription>
          </Alert>
        )}
        {!isLoading && !error && servers.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No MCP connections configured</EmptyTitle>
              <EmptyDescription>Configure an MCP server to run tools.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {server && (
          <>
            <FieldGroup className="sm:flex-row sm:items-end">
              <Field className="sm:w-48 sm:shrink-0">
                <FieldLabel htmlFor="playground-server">MCP server</FieldLabel>
                <Select
                  value={server.id}
                  onValueChange={(value) => {
                    if (value) {
                      setServerId(value);
                    }
                  }}
                >
                  <SelectTrigger id="playground-server" className="w-full">
                    <SelectValue>{server.name}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {servers.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                          {item.status !== "connected" ? " (unavailable)" : ""}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <div className="pb-1">
                <Badge variant={server.status === "connected" ? "outline" : "destructive"}>
                  {server.status === "connected"
                    ? "Connected"
                    : server.status === "needs-auth"
                      ? "Authentication required"
                      : "Unavailable"}
                </Badge>
              </div>
            </FieldGroup>
            <ServerPlayground key={server.id} server={server} />
          </>
        )}
      </div>
    </section>
  );
}

function PlaygroundSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{label}</span>
      <div
        aria-hidden="true"
        className="flex flex-col gap-6 motion-reduce:[&_[data-slot=skeleton]]:animate-none"
      >
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          {["arguments", "result"].map((panel) => (
            <Card key={panel} className="min-w-0">
              <CardHeader className="gap-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-full max-w-64" />
              </CardHeader>
              <CardContent className="min-h-72">
                <Skeleton className="h-8 w-36" />
                <Skeleton className="mt-5 h-48 w-full" />
              </CardContent>
              <CardFooter className="justify-between">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-24" />
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function ServerPlayground({ server }: { server: McpServer }) {
  const { state, retry } = useToolCatalog(server.id);
  const [toolName, setToolName] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const tools =
    state.status === "success"
      ? state.data.tools.filter(
          (item) => !(server.id === "superset" && item.raw_name === "call_tool"),
        )
      : [];
  const tool = tools.find((item) => item.name === toolName) ?? null;

  if (state.status === "loading") {
    return <PlaygroundSkeleton label={`Loading ${server.name} tools…`} />;
  }

  return (
    <>
      {server.status !== "connected" && (
        <Alert variant="destructive">
          <AlertTitle>MCP server unavailable</AlertTitle>
          <AlertDescription>
            Check this server's connection or credentials before running a tool.
          </AlertDescription>
        </Alert>
      )}
      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Could not load tools</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
          <Button variant="outline" onClick={retry}>
            Retry catalog
          </Button>
        </Alert>
      )}
      {state.status === "success" && tools.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No tools available</EmptyTitle>
            <EmptyDescription>This server has no executable tools in its catalog.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <FieldGroup>
        <Field className="min-w-0">
          <FieldLabel id="playground-tool-label">Tool</FieldLabel>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  role="combobox"
                  aria-labelledby="playground-tool-label"
                  aria-expanded={pickerOpen}
                  disabled={
                    state.status !== "success" ||
                    tools.length === 0 ||
                    server.status !== "connected"
                  }
                  className="w-full min-w-0 justify-between"
                />
              }
            >
              <span className="truncate">{tool?.name ?? "Search and select a tool…"}</span>
              <ChevronsUpDownIcon data-icon="inline-end" />
            </PopoverTrigger>
            <PopoverContent
              className="w-(--anchor-width) max-w-[calc(100vw-2rem)] p-0"
              align="start"
            >
              <Command>
                <CommandInput placeholder="Search tools…" aria-label="Search tools" />
                <CommandList>
                  <CommandEmpty>No tools found.</CommandEmpty>
                  <CommandGroup>
                    {tools.map((item) => (
                      <CommandItem
                        key={item.name}
                        value={item.name}
                        keywords={[item.description]}
                        onSelect={() => {
                          setToolName(item.name);
                          setPickerOpen(false);
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                          {item.name}
                        </span>
                        {tool?.name === item.name && <CheckIcon aria-hidden />}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </Field>
      </FieldGroup>

      <ToolRunner
        key={`${server.id}:${tool?.name ?? "empty"}:${server.status}`}
        serverId={server.id}
        tool={tool}
        connected={server.status === "connected"}
      />
    </>
  );
}

function ToolRunner({
  serverId,
  tool,
  connected,
}: {
  serverId: string;
  tool: CatalogTool | null;
  connected: boolean;
}) {
  const [json, setJson] = useState(defaultArguments(tool?.input_schema ?? null));
  const parameters = simpleParameters(tool?.input_schema ?? null);
  const { running, result, error, execute, reset } = useToolExecution(serverId, tool?.name);
  let arguments_: Record<string, unknown> = {};
  let jsonError = "";
  try {
    arguments_ = parseArguments(json);
  } catch {
    jsonError = 'Enter valid JSON with an object, for example {"limit": 10}.';
  }
  const errors = tool && !jsonError ? validateArguments(parameters, arguments_) : {};
  const valid =
    !!tool &&
    tool.input_schema !== null &&
    connected &&
    !jsonError &&
    Object.keys(errors).length === 0;

  async function runTool() {
    if (!tool || !valid || running) return;
    await execute(arguments_);
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      toast.add({ title: "Result copied", type: "success" });
    } catch {
      toast.add({
        title: "Couldn't copy the result",
        description: "Select and copy the result manually.",
        type: "error",
      });
    }
  }

  return (
    <div className="grid min-w-0 items-stretch gap-5 lg:grid-cols-2 animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out motion-reduce:animate-none">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Arguments</CardTitle>
          <CardDescription>
            {tool ? (
              <>
                <span className="block break-all font-mono text-xs text-foreground">
                  {tool.name}
                </span>
                <span className="mt-2 block max-h-32 overflow-y-auto whitespace-pre-wrap break-words">
                  {tool.description}
                </span>
              </>
            ) : (
              "Select a tool to configure its arguments."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-72 flex-1">
          {!tool ? (
            <Empty className="h-full">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FlaskConicalIcon />
                </EmptyMedia>
                <EmptyTitle>No tool selected</EmptyTitle>
                <EmptyDescription>Choose an MCP server and a tool to get started.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Tabs defaultValue={parameters === null ? "json" : "form"} className="gap-5">
              <TabsList aria-label="Argument editor">
                <TabsTrigger value="form" disabled={!!jsonError || parameters === null}>
                  Form
                </TabsTrigger>
                <TabsTrigger value="json">JSON</TabsTrigger>
              </TabsList>
              <TabsContent value="form">
                <FieldGroup>
                  {Object.entries(errors)
                    .filter(([name]) => !parameters?.some((parameter) => parameter.name === name))
                    .map(([name, message]) => (
                      <FieldError key={name}>{message}</FieldError>
                    ))}
                  {parameters?.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      This tool has no declared parameters.
                    </p>
                  )}
                  {parameters?.map((parameter) => (
                    <Field
                      key={parameter.name}
                      data-invalid={!!errors[parameter.name]}
                      data-disabled={running}
                    >
                      <FieldLabel htmlFor={`argument-${parameter.name}`}>
                        {parameter.name}
                        <span className="text-xs text-muted-foreground">
                          {parameter.required ? "Required" : "Optional"}
                        </span>
                      </FieldLabel>
                      <Input
                        id={`argument-${parameter.name}`}
                        type={parameter.type === "string" ? "text" : "number"}
                        min={parameter.minimum}
                        max={parameter.maximum}
                        step={
                          parameter.type === "integer"
                            ? 1
                            : parameter.type === "number"
                              ? "any"
                              : undefined
                        }
                        disabled={running}
                        required={parameter.required}
                        aria-invalid={!!errors[parameter.name]}
                        aria-describedby={`description-${parameter.name}${errors[parameter.name] ? ` error-${parameter.name}` : ""}`}
                        value={String(arguments_[parameter.name] ?? "")}
                        onChange={(event) => {
                          const next = { ...arguments_ };
                          if (event.target.value === "") delete next[parameter.name];
                          else
                            next[parameter.name] =
                              parameter.type === "string"
                                ? event.target.value
                                : Number(event.target.value);
                          setJson(JSON.stringify(next, null, 2));
                        }}
                      />
                      <FieldDescription id={`description-${parameter.name}`}>
                        {parameter.description}
                      </FieldDescription>
                      {errors[parameter.name] && (
                        <FieldError id={`error-${parameter.name}`}>
                          {errors[parameter.name]}
                        </FieldError>
                      )}
                    </Field>
                  ))}
                </FieldGroup>
              </TabsContent>
              <TabsContent value="json">
                <FieldGroup>
                  <Field
                    data-invalid={!!jsonError || Object.keys(errors).length > 0}
                    data-disabled={running}
                  >
                    <FieldLabel htmlFor="arguments-json" className="sr-only">
                      Arguments JSON
                    </FieldLabel>
                    <Textarea
                      id="arguments-json"
                      className="min-h-56 font-mono text-xs"
                      spellCheck={false}
                      disabled={running}
                      value={json}
                      onChange={(event) => setJson(event.target.value)}
                      aria-invalid={!!jsonError || Object.keys(errors).length > 0}
                      aria-describedby="arguments-json-help"
                    />
                    <FieldDescription id="arguments-json-help">
                      {parameters === null
                        ? "This tool uses a complex schema. Enter a JSON object matching the input schema below. The server validates arguments before execution."
                        : "Pass arguments as a JSON object. Fix invalid JSON before switching to Form."}
                    </FieldDescription>
                    {(jsonError || Object.keys(errors).length > 0) && (
                      <FieldError>{jsonError || Object.values(errors).join(" ")}</FieldError>
                    )}
                  </Field>
                </FieldGroup>
                <div className="mt-4 flex min-w-0 flex-col gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Input schema</p>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">
                    {JSON.stringify(tool.input_schema, null, 2)}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          )}
          {tool?.input_schema === null && (
            <Alert variant="destructive">
              <AlertTitle>Input schema unavailable</AlertTitle>
              <AlertDescription>
                This tool cannot run until its input schema is available.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="justify-between gap-2">
          <Button
            variant="ghost"
            disabled={!tool || running}
            onClick={() => {
              if (tool) setJson(defaultArguments(tool.input_schema));
              reset();
            }}
          >
            <RotateCcwIcon data-icon="inline-start" />
            Reset
          </Button>
          <Button disabled={!valid || running} onClick={runTool}>
            {running ? <Spinner data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
            {running ? "Running…" : "Run tool"}
          </Button>
        </CardFooter>
      </Card>

      <Card className="min-w-0" aria-busy={running}>
        <CardHeader>
          <CardTitle>Result</CardTitle>
          <CardDescription>Inspect the response from your MCP tool.</CardDescription>
          <CardAction>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Copy result"
              disabled={!result || running}
              onClick={copyResult}
            >
              <CopyIcon />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex min-h-72 min-w-0 flex-1 flex-col">
          <div role="status" className="sr-only">
            {running
              ? "Running tool"
              : error || result?.is_error
                ? "Tool execution failed"
                : result
                  ? "Tool execution succeeded"
                  : "Ready to run"}
          </div>
          {running ? (
            <div
              aria-hidden="true"
              className="flex flex-1 flex-col gap-4 motion-reduce:[&_[data-slot=skeleton]]:animate-none"
            >
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="min-h-48 w-full flex-1" />
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertTitle>Tool request failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : result ? (
            <Tabs
              defaultValue="formatted"
              className="min-w-0 gap-4 animate-in fade-in duration-200 ease-out motion-reduce:animate-none"
            >
              <TabsList aria-label="Result format">
                <TabsTrigger value="formatted">Formatted</TabsTrigger>
                <TabsTrigger value="raw">Raw JSON</TabsTrigger>
              </TabsList>
              <TabsContent value="formatted">
                {result.is_error && (
                  <Alert variant="destructive">
                    <AlertTitle>Tool execution failed</AlertTitle>
                    <AlertDescription>
                      The MCP server reported an error. Inspect the response below.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="flex flex-col gap-3">
                  {result.structured_content !== null && (
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Structured content
                      </p>
                      <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">
                        {JSON.stringify(result.structured_content, null, 2)}
                      </pre>
                    </div>
                  )}
                  {result.content.map((block, index) => (
                    <div key={index} className="flex min-w-0 flex-col gap-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        {typeof block.type === "string" ? block.type : "Content"}
                      </p>
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">
                        {block.type === "text" && typeof block.text === "string"
                          ? block.text
                          : JSON.stringify(block, null, 2)}
                      </pre>
                    </div>
                  ))}
                  {result.structured_content === null && result.content.length === 0 && (
                    <p className="text-sm text-muted-foreground">The tool returned no content.</p>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="raw">
                <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </TabsContent>
            </Tabs>
          ) : (
            <Empty className="h-full">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <TerminalIcon />
                </EmptyMedia>
                <EmptyTitle>Ready to run</EmptyTitle>
                <EmptyDescription>
                  Your tool response will appear here. Select a tool and click Run tool.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
        <CardFooter className="min-h-16 justify-between gap-2">
          <Badge variant={error || result?.is_error ? "destructive" : "outline"}>
            {running
              ? "Running"
              : error || result?.is_error
                ? "Error"
                : result
                  ? "Success"
                  : "No runs yet"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {result ? `${result.duration_ms} ms` : "MCP response"}
          </span>
        </CardFooter>
      </Card>
    </div>
  );
}
