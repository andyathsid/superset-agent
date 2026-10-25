"use client";

import { useId, useState, type SubmitEvent } from "react";
import { EyeIcon, EyeOffIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type AddModelDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: readonly AssistantModel[];
  providerApiKeys: ProviderApiKeys;
  onAdd: (model: AssistantModel, connection: ModelConnection, apiKey: string) => void;
};

export function AddModelDialog({
  open,
  onOpenChange,
  models,
  providerApiKeys,
  onAdd,
}: AddModelDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
        finalFocus={() =>
          document.querySelector<HTMLElement>('[data-slot="model-selector-trigger"]')
        }
      >
        <DialogHeader className="pr-6">
          <DialogTitle>Add model</DialogTitle>
          <DialogDescription>
            Add a model for this session. Reloading clears it. No API request is made.
          </DialogDescription>
        </DialogHeader>
        <AddModelForm
          models={models}
          providerApiKeys={providerApiKeys}
          onAdd={onAdd}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function AddModelForm({
  models,
  providerApiKeys,
  onAdd,
  onCancel,
}: Pick<AddModelDialogProps, "models" | "providerApiKeys" | "onAdd"> & { onCancel: () => void }) {
  const id = useId();
  const [provider, setProvider] = useState<ModelProviderId>("custom");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [error, setError] = useState("");
  const policy = providerConnections[provider];

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const modelId = String(data.get("modelId") ?? "").trim();
    const name = String(data.get("displayName") ?? "").trim();
    const description = String(data.get("description") ?? "").trim();
    const url = (policy.editableBaseUrl ? baseUrl : policy.baseUrl).trim();
    const key = provider === "ollama" ? "" : apiKey.trim();
    if (!modelId || !name || !url || (policy.requiresApiKey && !key)) {
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
    const model = { id: `${provider}/${modelId}`, name, provider, description };
    if (models.some((item) => item.id === model.id)) {
      setError("This provider already has a model with that Model ID.");
      return;
    }
    onAdd(model, { modelId, baseUrl: url }, key);
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
            setBaseUrl(providerConnections[next.id].baseUrl);
            setApiKey(
              next.id === "custom" || next.id === "ollama" ? "" : (providerApiKeys[next.id] ?? ""),
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
            disabled={provider === "ollama"}
            placeholder={provider === "ollama" ? "API key not required" : "Enter API key"}
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
            disabled={provider === "ollama"}
            onClick={() => setShowApiKey((value) => !value)}
          >
            {showApiKey ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {provider === "ollama"
            ? "Ollama does not require an API key."
            : provider === "custom"
              ? "This key applies only to this model."
              : "Saving applies this key to all models from this provider."}
        </p>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-description`} className="text-sm font-medium">
          Description <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id={`${id}-description`}
          name="description"
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
          <PlusIcon className="size-3.5" />
          Add model
        </Button>
      </DialogFooter>
    </form>
  );
}
