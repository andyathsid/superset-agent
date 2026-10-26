"use client";

import { ChevronDownIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  CollapsibleContent,
  CollapsibleRoot,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Match docstring indentation without removing indentation inside lists or code examples.
function cleanDescription(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  const indents = lines
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => line.length - line.trimStart().length);
  const margin = indents.length ? Math.min(...indents) : 0;
  return [lines[0].trimStart(), ...lines.slice(1).map((line) => line.slice(margin))]
    .join("\n")
    .trim();
}

export function ToolDescription({ text, summary = false }: { text: string; summary?: boolean }) {
  const paragraphs = cleanDescription(text).split(/\n\s*\n/);
  if (!text.trim()) return null;

  return (
    <div className="flex min-w-0 flex-col gap-3 text-sm leading-relaxed [overflow-wrap:anywhere]">
      {paragraphs.map((paragraph, index) => (
        <p
          key={index}
          className={cn(
            "whitespace-pre-wrap",
            summary && index === 0 ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function typeLabel(schema: unknown, depth = 0): string {
  if (schema === false) return "not allowed";
  if (!isObject(schema) || depth > 5) return "any";
  if (Array.isArray(schema.type)) return schema.type.join(" or ");
  if (schema.type === "array") return `array of ${typeLabel(schema.items, depth + 1)}`;
  if (typeof schema.type === "string") return schema.type;
  for (const key of ["anyOf", "oneOf"]) {
    if (Array.isArray(schema[key])) {
      return Array.from(new Set(schema[key].map((item) => typeLabel(item, depth + 1)))).join(
        " or ",
      );
    }
  }
  if (isObject(schema.properties)) return "object";
  return "any";
}

function formatValue(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

function SchemaDetails({ schema, depth }: { schema: unknown; depth: number }) {
  if (schema === false)
    return <p className="text-sm text-muted-foreground">No value is allowed.</p>;
  if (schema === true)
    return <p className="text-sm text-muted-foreground">Any value is allowed.</p>;
  if (!isObject(schema)) return null;
  if (depth > 6)
    return <p className="text-xs text-muted-foreground">See JSON Schema for deeper fields.</p>;

  const properties = isObject(schema.properties) ? Object.entries(schema.properties) : [];
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const constraints: [string, unknown][] = [
    ["Min length", schema.minLength],
    ["Max length", schema.maxLength],
    ["Minimum", schema.minimum],
    ["Maximum", schema.maximum],
    ["Greater than", schema.exclusiveMinimum],
    ["Less than", schema.exclusiveMaximum],
    ["Multiple of", schema.multipleOf],
    ["Min items", schema.minItems],
    ["Max items", schema.maxItems],
    ["Unique items", schema.uniqueItems],
    ["Format", schema.format],
    ["Pattern", schema.pattern],
  ];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {typeof schema.description === "string" && <ToolDescription text={schema.description} />}
      {(Object.hasOwn(schema, "default") ||
        Object.hasOwn(schema, "const") ||
        constraints.some(([, value]) => value !== undefined)) && (
        <dl className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {Object.hasOwn(schema, "default") && (
            <div className="min-w-0">
              <dt className="inline">Default: </dt>
              <dd className="inline font-mono">{formatValue(schema.default)}</dd>
            </div>
          )}
          {Object.hasOwn(schema, "const") && (
            <div className="min-w-0">
              <dt className="inline">Value: </dt>
              <dd className="inline font-mono">{formatValue(schema.const)}</dd>
            </div>
          )}
          {constraints
            .filter(([, value]) => value !== undefined)
            .map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="inline">{label}: </dt>
                <dd className="inline font-mono">{String(value)}</dd>
              </div>
            ))}
        </dl>
      )}
      {Array.isArray(schema.enum) && (
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs text-muted-foreground">Allowed values</p>
          <div className="flex flex-wrap gap-1.5">
            {schema.enum.map((value, index) => (
              <Badge
                key={index}
                variant="outline"
                className="h-auto max-w-full whitespace-normal [overflow-wrap:anywhere]"
              >
                {formatValue(value)}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {typeof schema.$ref === "string" && (
        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
          Schema reference: <code>{schema.$ref}</code>. See JSON Schema for its definition.
        </p>
      )}
      {properties.length > 0 && (
        <dl className={cn("flex min-w-0 flex-col divide-y", depth > 0 && "border-l pl-3 sm:pl-4")}>
          {properties.map(([name, property]) => (
            <div
              key={name}
              data-parameter-name={name}
              className="flex min-w-0 flex-col gap-2 py-4 first:pt-0 last:pb-0"
            >
              <dt className="flex min-w-0 flex-wrap items-center gap-2">
                <code className="text-sm font-medium [overflow-wrap:anywhere]">{name}</code>
                <Badge
                  variant="info"
                  className="h-auto max-w-full whitespace-normal [overflow-wrap:anywhere]"
                >
                  {typeLabel(property)}
                </Badge>
                <Badge variant={required.has(name) ? "destructive" : "secondary"}>
                  {required.has(name) ? "Required" : "Optional"}
                </Badge>
              </dt>
              <dd className="min-w-0">
                <SchemaDetails schema={property} depth={depth + 1} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {schema.items !== undefined && (
        <div className="flex min-w-0 flex-col gap-2 border-l pl-3 sm:pl-4">
          <p className="text-xs font-medium">Array items · {typeLabel(schema.items)}</p>
          <SchemaDetails schema={schema.items} depth={depth + 1} />
        </div>
      )}
      {(["anyOf", "oneOf", "allOf"] as const).map((key) => {
        const alternatives = schema[key];
        if (!Array.isArray(alternatives)) return null;
        return (
          <div key={key} className="flex min-w-0 flex-col gap-3 border-l pl-3 sm:pl-4">
            <p className="text-xs font-medium">
              {key === "allOf"
                ? "Must match all schemas"
                : key === "oneOf"
                  ? "Must match exactly one option"
                  : "Must match at least one option"}
            </p>
            {alternatives.map((option, index) => (
              <div key={index} className="flex min-w-0 flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  {key === "allOf" ? "Schema" : "Option"} {index + 1} · {typeLabel(option)}
                </p>
                <SchemaDetails schema={option} depth={depth + 1} />
              </div>
            ))}
          </div>
        );
      })}
      {schema.additionalProperties === false && (
        <p className="text-xs text-muted-foreground">Additional fields are not allowed.</p>
      )}
      {schema.additionalProperties === true && (
        <p className="text-xs text-muted-foreground">Additional fields are allowed.</p>
      )}
      {isObject(schema.additionalProperties) && (
        <div className="flex min-w-0 flex-col gap-2 border-l pl-3">
          <p className="text-xs text-muted-foreground">
            Additional fields · {typeLabel(schema.additionalProperties)}
          </p>
          <SchemaDetails schema={schema.additionalProperties} depth={depth + 1} />
        </div>
      )}
    </div>
  );
}

export function ToolParameters({
  schema,
  toolName,
}: {
  schema: Record<string, unknown> | null;
  toolName: string;
}) {
  const hasProperties =
    schema && isObject(schema.properties) && Object.keys(schema.properties).length > 0;

  return (
    <section aria-label={`${toolName} parameters`} className="flex min-w-0 flex-col gap-4">
      <h4 className="text-sm font-medium">Parameters</h4>
      {schema === null ? (
        <p className="text-sm text-muted-foreground">
          Parameter schema is not provided for this tool.
        </p>
      ) : (
        <>
          <div className="min-w-0 rounded-lg border bg-muted/20 p-4">
            {!hasProperties && (
              <p className="mb-3 text-sm text-muted-foreground">
                {Object.keys(schema).length === 0
                  ? "This schema does not restrict the input. No named parameters are documented."
                  : "No named parameters are documented at this level. See the schema details below."}
              </p>
            )}
            <SchemaDetails schema={schema} depth={0} />
          </div>
          <CollapsibleRoot>
            <CollapsibleTrigger className="group/schema flex items-center gap-2 rounded-md py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4">
              <ChevronDownIcon
                aria-hidden
                className="transition-transform group-aria-expanded/schema:rotate-180 motion-reduce:transition-none"
              />
              View JSON Schema
            </CollapsibleTrigger>
            <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out data-[starting-style]:h-0 data-[starting-style]:opacity-0 data-[ending-style]:h-0 data-[ending-style]:opacity-0 motion-reduce:transition-none">
              <pre
                aria-label={`${toolName} parameter schema`}
                tabIndex={0}
                className="mt-3 max-h-80 overflow-auto rounded-md bg-muted/50 p-3 text-xs leading-relaxed"
              >
                <code>{JSON.stringify(schema, null, 2)}</code>
              </pre>
            </CollapsibleContent>
          </CollapsibleRoot>
        </>
      )}
    </section>
  );
}
