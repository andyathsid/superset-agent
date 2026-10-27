"use client";

import { useState } from "react";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  CopyIcon,
  FlaskConicalIcon,
  InfoIcon,
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
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  defaultArguments,
  demoServers,
  demoTools,
  parseArguments,
  validateArguments,
  type DemoTool,
} from "../lib/playground-demo";

type RunResult = { status: "success" | "error"; durationMs: number; data: unknown };

export function ToolsPlayground() {
  const [server, setServer] = useState("superset");
  const [tool, setTool] = useState<DemoTool | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <section aria-labelledby="tools-playground-title" className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-16 pb-10 md:px-8 md:pt-10 animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <FlaskConicalIcon aria-hidden className="size-5" />
            <h1 id="tools-playground-title" className="text-2xl font-semibold tracking-tight">
              Tools Playground
            </h1>
            <Badge variant="outline">Demo mode</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Choose a tool, set its arguments, and inspect the result.
          </p>
        </header>

        <Alert role="note">
          <InfoIcon aria-hidden />
          <AlertTitle>Try tools with sample data</AlertTitle>
          <AlertDescription>
            Runs are simulated. No requests are sent to your MCP servers.
          </AlertDescription>
        </Alert>

        <FieldGroup className="sm:flex-row sm:items-end">
          <Field className="sm:w-48 sm:shrink-0">
            <FieldLabel htmlFor="playground-server">MCP server</FieldLabel>
            <Select
              value={server}
              onValueChange={(value) => {
                if (value) {
                  setServer(value);
                  setTool(null);
                }
              }}
            >
              <SelectTrigger id="playground-server" className="w-full">
                <SelectValue>{demoServers.find((item) => item.id === server)?.name}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {demoServers.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field className="min-w-0 flex-1">
            <FieldLabel id="playground-tool-label">Tool</FieldLabel>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-labelledby="playground-tool-label"
                    aria-expanded={pickerOpen}
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
                      {demoTools
                        .filter((item) => item.server === server)
                        .map((item) => (
                          <CommandItem
                            key={item.name}
                            value={item.name}
                            keywords={[item.description]}
                            onSelect={() => {
                              setTool(item);
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

        <ToolRunner key={`${server}:${tool?.name ?? "empty"}`} tool={tool} />
      </div>
    </section>
  );
}

function ToolRunner({ tool }: { tool: DemoTool | null }) {
  const [json, setJson] = useState(tool ? defaultArguments(tool) : "{}");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  let arguments_: Record<string, unknown> = {};
  let jsonError = "";
  try {
    arguments_ = parseArguments(json);
  } catch {
    jsonError = 'Enter valid JSON with an object, for example {"limit": 10}.';
  }
  const errors = tool && !jsonError ? validateArguments(tool, arguments_) : {};
  const valid = !!tool && !jsonError && Object.keys(errors).length === 0;

  async function runTool() {
    if (!tool || !valid || running) return;
    setRunning(true);
    setResult(null);
    const startedAt = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 800));
    try {
      setResult({
        status: "success",
        data: tool.execute(arguments_),
        durationMs: Math.round(performance.now() - startedAt),
      });
    } catch (error) {
      setResult({
        status: "error",
        data: { error: error instanceof Error ? error.message : "The demo run failed." },
        durationMs: Math.round(performance.now() - startedAt),
      });
    } finally {
      setRunning(false);
    }
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(result?.data, null, 2));
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
    <div className="grid min-w-0 items-stretch gap-5 lg:grid-cols-2">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Arguments</CardTitle>
          <CardDescription>
            {tool ? (
              <>
                <span className="block break-all font-mono text-xs text-foreground">
                  {tool.name}
                </span>
                <span className="mt-2 block">{tool.description}</span>
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
            <Tabs defaultValue="form" className="gap-5">
              <TabsList aria-label="Argument editor">
                <TabsTrigger value="form" disabled={!!jsonError}>
                  Form
                </TabsTrigger>
                <TabsTrigger value="json">JSON</TabsTrigger>
              </TabsList>
              <TabsContent value="form">
                <FieldGroup>
                  {Object.entries(errors)
                    .filter(
                      ([name]) => !tool.parameters.some((parameter) => parameter.name === name),
                    )
                    .map(([name, message]) => (
                      <FieldError key={name}>{message}</FieldError>
                    ))}
                  {tool.parameters.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      This tool requires no arguments.
                    </p>
                  )}
                  {tool.parameters.map((parameter) => (
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
                        type={parameter.type === "integer" ? "number" : "text"}
                        min={parameter.minimum}
                        max={parameter.maximum}
                        step={parameter.type === "integer" ? 1 : undefined}
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
                              parameter.type === "integer"
                                ? Number(event.target.value)
                                : event.target.value;
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
                      Pass arguments as a JSON object. Fix invalid JSON before switching to Form.
                    </FieldDescription>
                    {(jsonError || Object.keys(errors).length > 0) && (
                      <FieldError>{jsonError || Object.values(errors).join(" ")}</FieldError>
                    )}
                  </Field>
                </FieldGroup>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
        <CardFooter className="justify-between gap-2">
          <Button
            variant="ghost"
            disabled={!tool || running}
            onClick={() => {
              if (tool) setJson(defaultArguments(tool));
              setResult(null);
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
          <CardDescription>Inspect the response from your demo run.</CardDescription>
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
            {running ? "Running tool" : result ? `Demo run ${result.status}` : "Ready to run"}
          </div>
          {running ? (
            <Empty className="h-full">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Spinner />
                </EmptyMedia>
                <EmptyTitle>Running tool…</EmptyTitle>
                <EmptyDescription>Preparing a sample response.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : result ? (
            <Tabs defaultValue="formatted" className="min-w-0 gap-4">
              <TabsList aria-label="Result format">
                <TabsTrigger value="formatted">Formatted</TabsTrigger>
                <TabsTrigger value="raw">Raw JSON</TabsTrigger>
              </TabsList>
              <TabsContent value="formatted">
                {result.status === "error" ? (
                  <Alert variant="destructive">
                    <AlertTitle>Tool execution failed</AlertTitle>
                    <AlertDescription>
                      {String((result.data as { error: string }).error)}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="flex flex-col gap-3">
                    {Object.entries(result.data as Record<string, unknown>).map(([name, value]) => (
                      <div key={name} className="flex min-w-0 flex-col gap-1">
                        <p className="text-xs font-medium text-muted-foreground">{name}</p>
                        <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">
                          {typeof value === "object"
                            ? JSON.stringify(value, null, 2)
                            : String(value)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="raw">
                <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed">
                  {JSON.stringify(result.data, null, 2)}
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
          <Badge variant={result?.status === "error" ? "destructive" : "outline"}>
            {running
              ? "Running"
              : result?.status === "success"
                ? "Success"
                : result?.status === "error"
                  ? "Error"
                  : "No runs yet"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {result ? `${result.durationMs} ms · Simulated` : "Demo response"}
          </span>
        </CardFooter>
      </Card>
    </div>
  );
}
