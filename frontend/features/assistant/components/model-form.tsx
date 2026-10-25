"use client";

import { useId, useState, type SubmitEvent } from "react";
import { EyeIcon, EyeOffIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  modelProviders,
  providerConnections,
  type AssistantModel,
  type ModelConnection,
  type ModelProviderId,
  type ProviderApiKeys,
} from "../config/models";
import { getModelConnection } from "../runtime/model-config";

type ModelFormProps = {
  model?: AssistantModel;
  initialApiKey?: string;
  models: readonly AssistantModel[];
  connections: ReadonlyMap<string, ModelConnection>;
  providerApiKeys: ProviderApiKeys;
  onSave: (model: AssistantModel, connection: ModelConnection, apiKey?: string) => void;
  onCancel: () => void;
};

export function ModelForm({
  model,
  initialApiKey = "",
  models,
  connections,
  providerApiKeys,
  onSave,
  onCancel,
}: ModelFormProps) {
  const id = useId();
  const initialConnection = model ? getModelConnection(model, connections) : undefined;
  const [provider, setProvider] = useState<ModelProviderId>(model?.provider ?? "custom");
  const [baseUrl, setBaseUrl] = useState(initialConnection?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState(model?.provider === "custom" ? initialApiKey : "");
  const [showApiKey, setShowApiKey] = useState(false);
  const [error, setError] = useState("");
  const policy = providerConnections[provider];
  const editing = !!model;
  const showApiKeyField = provider !== "ollama" && (!editing || provider === "custom");

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const modelId = String(data.get("modelId") ?? "").trim();
    const name = String(data.get("displayName") ?? "").trim();
    const description = String(data.get("description") ?? "").trim();
    const url = (policy.editableBaseUrl ? baseUrl : policy.baseUrl).trim();
    const key = showApiKeyField ? apiKey.trim() : undefined;
    if (!modelId || !name || !url || (showApiKeyField && policy.requiresApiKey && !key)) {
      setError("Complete all required fields. Values cannot contain only spaces.");
      return;
    }
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
        throw new Error("Invalid base URL");
      }
    } catch {
      setError("Enter a valid HTTP or HTTPS base URL without embedded credentials.");
      return;
    }
    if (
      models.some(
        (item) =>
          item.id !== model?.id &&
          item.provider === provider &&
          getModelConnection(item, connections).modelId === modelId,
      )
    ) {
      setError("This provider already has a model with that Model ID.");
      return;
    }
    const preferredId = `${provider}/${modelId}`;
    const savedId =
      model?.id ??
      (models.some((item) => item.id === preferredId) ? crypto.randomUUID() : preferredId);
    onSave({ id: savedId, name, provider, description }, { modelId, baseUrl: url }, key);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-4"
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-provider`} className="text-sm font-medium">
          Provider
        </label>
        <Select
          value={provider}
          items={modelProviders.map((item) => ({ value: item.id, label: item.name }))}
          onValueChange={(value) => {
            const next = modelProviders.find((item) => item.id === value);
            if (!next) return;
            setProvider(next.id);
            setBaseUrl(
              next.id === model?.provider
                ? (initialConnection?.baseUrl ?? providerConnections[next.id].baseUrl)
                : providerConnections[next.id].baseUrl,
            );
            setApiKey(
              next.id === "custom"
                ? model?.provider === "custom"
                  ? initialApiKey
                  : ""
                : next.id === "ollama"
                  ? ""
                  : (providerApiKeys[next.id] ?? ""),
            );
            setShowApiKey(false);
            setError("");
          }}
        >
          <SelectTrigger id={`${id}-provider`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {modelProviders.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-model`} className="text-sm font-medium">
            Model ID <span className="text-destructive">*</span>
          </label>
          <Input
            id={`${id}-model`}
            name="modelId"
            defaultValue={initialConnection?.modelId ?? ""}
            required
            placeholder="my-model"
            autoComplete="off"
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-name`} className="text-sm font-medium">
            Display name <span className="text-destructive">*</span>
          </label>
          <Input
            id={`${id}-name`}
            name="displayName"
            defaultValue={model?.name ?? ""}
            required
            placeholder="My model"
            autoComplete="off"
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-url`} className="text-sm font-medium">
          Base URL <span className="text-destructive">*</span>
        </label>
        <Input
          id={`${id}-url`}
          type="url"
          required
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          readOnly={!policy.editableBaseUrl}
          placeholder="https://your-server.example/v1"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={`${id}-url-hint`}
          className={!policy.editableBaseUrl ? "bg-muted/50 text-muted-foreground" : undefined}
        />
        <p id={`${id}-url-hint`} className="text-xs text-muted-foreground">
          {policy.editableBaseUrl
            ? "Use the base URL of your model server."
            : "Official provider endpoint. This URL is fixed."}
        </p>
      </div>
      {showApiKeyField ? (
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-key`} className="text-sm font-medium">
            API key{" "}
            {policy.requiresApiKey ? (
              <span className="text-destructive">*</span>
            ) : (
              <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            )}
          </label>
          <div className="relative">
            <Input
              id={`${id}-key`}
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              required={policy.requiresApiKey}
              placeholder="Enter API key"
              className="pr-10"
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="none"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-0.5 top-0.5"
              aria-label={showApiKey ? "Hide API key" : "Show API key"}
              aria-pressed={showApiKey}
              onClick={() => setShowApiKey((value) => !value)}
            >
              {showApiKey ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {provider === "custom"
              ? "This key applies only to this model."
              : "Saving applies this key to all models from this provider."}
          </p>
        </div>
      ) : (
        provider !== "ollama" && (
          <p className="text-xs text-muted-foreground">
            {providerApiKeys[provider]?.trim()
              ? "API key is managed through the provider gear icon."
              : "Set an API key through the provider gear icon to enable this model."}
          </p>
        )
      )}
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-description`} className="text-sm font-medium">
          Description <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id={`${id}-description`}
          name="description"
          defaultValue={model?.description ?? ""}
          placeholder="What is this model useful for?"
          rows={2}
          className="max-h-28 resize-y"
        />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter className="flex-row justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="bg-blue-600 text-white hover:bg-blue-500">
          {!editing && <PlusIcon className="size-3.5" />}
          {editing ? "Save changes" : "Add model"}
        </Button>
      </DialogFooter>
    </form>
  );
}
