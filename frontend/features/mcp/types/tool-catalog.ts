export type CatalogTool = {
  name: string;
  raw_name: string;
  description: string;
  category: string;
  source: "base" | "discovered";
  input_schema: Record<string, unknown> | null;
};

export type CatalogConnection = {
  server_id: string;
  name: string;
  description: string;
  tools: CatalogTool[];
};

export type McpToolCatalogResponse = {
  server_id: "superset" | "openmetadata";
  fetched_at: string;
  tools: CatalogTool[];
};
