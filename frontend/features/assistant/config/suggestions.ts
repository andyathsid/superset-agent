import { AuiConfig, Suggestions } from "@assistant-ui/react";

export const assistantConfig = AuiConfig({
  suggestions: Suggestions([
    {
      title: "What can you do?",
      label: "Get a quick introduction",
      prompt: "Briefly describe how you can help me with Superset. ",
    },
    {
      title: "List datasets",
      label: "See available dataset names and IDs",
      prompt:
        "List up to 5 available datasets with their names and IDs. " +
        "Use catalog metadata only. Do not inspect columns or query data.",
    },
    {
      title: "List charts",
      label: "See existing charts",
      prompt:
        "List up to 5 existing charts with their names and chart types. " +
        "Do not fetch chart data or create anything.",
    },
  ]),
});
