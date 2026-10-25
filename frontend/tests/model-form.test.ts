import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelForm } from "../features/assistant/components/model-form";
import { assistantModels, modelProviders } from "../features/assistant/config/models";

test("editing built-in models prefills their configuration and hides provider keys", () => {
  for (const model of assistantModels) {
    const html = renderToStaticMarkup(
      createElement(ModelForm, {
        model,
        models: assistantModels,
        connections: new Map(),
        providerApiKeys: { openai: "shared-secret" },
        onSave() {},
        onCancel() {},
      }),
    );
    assert.ok(html.includes(`value="${model.id.slice(model.provider.length + 1)}"`));
    assert.ok(html.includes(`value="${model.name}"`));
    assert.ok(html.includes(model.description));
    assert.ok(html.includes("Save changes"));
    assert.ok(!html.includes('type="password"'));
    assert.ok(!html.includes("shared-secret"));
    assert.equal(html.includes("provider gear icon"), model.provider !== "ollama");
  }
});

test("edited connections override internal IDs, with an API key field only for Custom", () => {
  for (const { id: provider } of modelProviders) {
    const model = {
      id: "openai/original-model",
      name: "Edited model",
      provider,
      description: "Edited description",
    };
    const html = renderToStaticMarkup(
      createElement(ModelForm, {
        model,
        initialApiKey: "custom-secret",
        models: [model],
        connections: new Map([
          [
            model.id,
            {
              modelId: "vendor/edited-model",
              baseUrl: "http://localhost:12345/v1",
            },
          ],
        ]),
        providerApiKeys: {},
        onSave() {},
        onCancel() {},
      }),
    );
    assert.ok(html.includes('value="vendor/edited-model"'));
    assert.ok(html.includes('value="http://localhost:12345/v1"'));
    assert.equal(html.includes('type="password"'), provider === "custom");
    assert.equal(html.includes('value="custom-secret"'), provider === "custom");
  }
});
