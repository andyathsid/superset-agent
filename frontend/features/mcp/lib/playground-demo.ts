export type DemoParameter = {
  name: string;
  type: "string" | "integer";
  description: string;
  required?: boolean;
  defaultValue?: string | number;
  minimum?: number;
  maximum?: number;
};

export type DemoTool = {
  server: string;
  name: string;
  description: string;
  parameters: DemoParameter[];
  execute: (arguments_: Record<string, unknown>) => unknown;
};

export const demoServers = [
  { id: "superset", name: "Superset" },
  { id: "openmetadata", name: "OpenMetadata" },
];

const limitParameter: DemoParameter = {
  name: "limit",
  type: "integer",
  description: "Maximum number of results, from 1 to 100.",
  defaultValue: 10,
  minimum: 1,
  maximum: 100,
};

export const demoTools: DemoTool[] = [
  {
    server: "superset",
    name: "superset_list_charts",
    description: "List charts available in your Superset workspace.",
    parameters: [limitParameter],
    execute: (arguments_) => ({
      charts: [
        { id: 12, name: "Revenue by month", chart_type: "echarts_timeseries_bar" },
        { id: 24, name: "Orders by region", chart_type: "pie" },
        { id: 38, name: "Active customers", chart_type: "big_number_total" },
      ].slice(0, Number(arguments_.limit ?? 10)),
    }),
  },
  {
    server: "superset",
    name: "superset_get_dashboard_info",
    description:
      "Get a dashboard and its charts. Use ID 1 for a result, or 404 to preview an error.",
    parameters: [
      {
        name: "dashboard_id",
        type: "integer",
        required: true,
        minimum: 1,
        description: "ID of the dashboard to retrieve.",
      },
    ],
    execute: (arguments_) => {
      if (arguments_.dashboard_id !== 1)
        throw new Error(
          `Dashboard ${arguments_.dashboard_id} was not found in the demo workspace. Try ID 1.`,
        );
      return {
        id: 1,
        title: "Sales overview",
        published: true,
        charts: [
          { id: 12, name: "Revenue by month" },
          { id: 24, name: "Orders by region" },
        ],
      };
    },
  },
  {
    server: "openmetadata",
    name: "search_metadata",
    description: "Search sample data assets by name or description.",
    parameters: [
      {
        name: "query",
        type: "string",
        required: true,
        description: "Try orders, customers, or revenue.",
      },
      limitParameter,
    ],
    execute: (arguments_) => ({
      assets: [
        { name: "orders", type: "table", description: "Customer orders and revenue." },
        { name: "customers", type: "table", description: "Customer profiles and regions." },
        { name: "monthly_revenue", type: "table", description: "Monthly revenue totals." },
      ]
        .filter((asset) =>
          `${asset.name} ${asset.description}`.includes(String(arguments_.query).toLowerCase()),
        )
        .slice(0, Number(arguments_.limit ?? 10)),
    }),
  },
  {
    server: "openmetadata",
    name: "get_service_info",
    description: "Inspect the sample metadata service. This tool requires no arguments.",
    parameters: [],
    execute: () => ({
      name: "Demo warehouse",
      service_type: "Postgres",
      database_count: 3,
      table_count: 42,
    }),
  },
];

export function defaultArguments(tool: DemoTool) {
  return JSON.stringify(
    Object.fromEntries(
      tool.parameters
        .filter((parameter) => parameter.defaultValue !== undefined)
        .map((parameter) => [parameter.name, parameter.defaultValue]),
    ),
    null,
    2,
  );
}

export function parseArguments(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Arguments must be a JSON object.");
  return value as Record<string, unknown>;
}

export function validateArguments(tool: DemoTool, arguments_: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  for (const parameter of tool.parameters) {
    const value = arguments_[parameter.name];
    if (value === undefined || value === "") {
      if (parameter.required) errors[parameter.name] = `${parameter.name} is required.`;
      continue;
    }
    if (parameter.type === "integer" && (typeof value !== "number" || !Number.isInteger(value))) {
      errors[parameter.name] = "Enter a whole number.";
    } else if (parameter.type === "string" && (typeof value !== "string" || !value.trim())) {
      errors[parameter.name] = "Enter a non-empty string.";
    } else if (
      typeof value === "number" &&
      ((parameter.minimum !== undefined && value < parameter.minimum) ||
        (parameter.maximum !== undefined && value > parameter.maximum))
    ) {
      errors[parameter.name] =
        `Value must be ${parameter.minimum} or greater${parameter.maximum === undefined ? "." : `, up to ${parameter.maximum}.`}`;
    }
  }
  for (const name of Object.keys(arguments_)) {
    if (!tool.parameters.some((parameter) => parameter.name === name))
      errors[name] = `Unknown argument: ${name}.`;
  }
  return errors;
}
