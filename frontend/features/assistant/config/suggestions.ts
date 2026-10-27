import { AuiConfig, Suggestions } from "@assistant-ui/react";

export const assistantConfig = AuiConfig({
  suggestions: Suggestions([
    {
      title: "What can you do?",
      label: "Get a quick introduction",
      prompt: "Briefly describe how you can help me with OpenMetadata or Superset. ",
    },
    {
      title: "List data",
      label: "See available data names and IDs",
      prompt:
        "List up to 5 available metadata in OpenMetadata and dataset in Superset. "
    },
    {
      title: "List dashboards",
      label: "See existing dashboards ",
      prompt:
        "List up to 3 existing dashboards in Superset. "
    },
  ]),
});
