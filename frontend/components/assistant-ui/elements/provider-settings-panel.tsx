"use client";

import { useState } from "react";
import { Settings2Icon, ShieldCheckIcon } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { CustomProviderLogo, OllamaLogo, OpenRouterLogo } from "./logos";

export type ProviderId = "openrouter" | "ollama" | "custom";

export type ModelConnection = {
  provider: ProviderId;
  endpoint: string;
  model: string;
  apiKey: string;
};

export type ProviderConnections = Record<ProviderId, ModelConnection>;

const PROVIDERS: ReadonlyArray<{
  value: ProviderId;
  label: string;
  description: string;
}> = [
  {
    value: "ollama",
    label: "Ollama",
    description: "Run models from your local Ollama server.",
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    description: "Use hosted models through OpenRouter.",
  },
  {
    value: "custom",
    label: "Custom",
    description: "Connect to an OpenAI-compatible endpoint.",
  },
];

const PROVIDER_BY_ID = Object.fromEntries(
  PROVIDERS.map((provider) => [provider.value, provider]),
) as Record<ProviderId, (typeof PROVIDERS)[number]>;

function ProviderIcon({ provider }: { provider: ProviderId }) {
  const iconClassName = "size-4";

  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-background">
      {provider === "ollama" && <OllamaLogo className={iconClassName} />}
      {provider === "openrouter" && <OpenRouterLogo className={iconClassName} />}
      {provider === "custom" && <CustomProviderLogo className={iconClassName} />}
    </span>
  );
}

function ProviderIdentity({ provider }: { provider: ProviderId }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <ProviderIcon provider={provider} />
      <span className="truncate font-medium">{PROVIDER_BY_ID[provider].label}</span>
    </span>
  );
}

type ProviderSettingsPanelProps = {
  connections: ProviderConnections;
  onConnectionsChange: (connections: ProviderConnections) => void;
};

export function ProviderSettingsPanel({
  connections,
  onConnectionsChange,
}: ProviderSettingsPanelProps) {
  const [editingProvider, setEditingProvider] = useState<ProviderId>("ollama");
  const connection = connections[editingProvider];

  const updateConnection = (changes: Partial<ModelConnection>) => {
    onConnectionsChange({
      ...connections,
      [editingProvider]: { ...connection, ...changes },
    });
  };

  const endpointLocked = editingProvider !== "custom";
  const apiKeyDisabled = editingProvider === "ollama";
  const providerDetails = PROVIDER_BY_ID[editingProvider];

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="w-full justify-start" />}>
        <Settings2Icon />
        Model provider
      </DialogTrigger>

      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="pr-8">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border bg-muted/50">
              <Settings2Icon className="size-4" />
            </span>
            <div className="grid gap-1.5">
              <DialogTitle>Model provider settings</DialogTitle>
              <DialogDescription>
                Configure the connection used by each model provider.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Separator />

        <div className="grid gap-5 py-1">
          <div className="grid gap-2">
            <label htmlFor="provider-settings-provider" className="text-sm font-medium">
              Provider
            </label>
            <Select
              value={editingProvider}
              onValueChange={(provider) => {
                if (provider) setEditingProvider(provider);
              }}
            >
              <SelectTrigger
                id="provider-settings-provider"
                className="w-full data-[size=default]:h-11"
              >
                <SelectValue>
                  {(provider) =>
                    provider ? <ProviderIdentity provider={provider as ProviderId} /> : null
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                {PROVIDERS.map((provider) => (
                  <SelectItem key={provider.value} value={provider.value} className="py-2">
                    <ProviderIcon provider={provider.value} />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="font-medium">{provider.label}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {provider.description}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {providerDetails.description}
            </p>
          </div>

          <Separator />

          <div className="grid gap-4">
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="provider-settings-endpoint" className="text-sm font-medium">
                  Endpoint
                </label>
                {endpointLocked && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Managed
                  </span>
                )}
              </div>
              <Input
                id="provider-settings-endpoint"
                type="url"
                value={connection.endpoint}
                disabled={endpointLocked}
                placeholder="https://provider.example/v1"
                autoComplete="off"
                spellCheck={false}
                aria-describedby="provider-settings-endpoint-description"
                onChange={(event) => updateConnection({ endpoint: event.target.value })}
              />
              <p
                id="provider-settings-endpoint-description"
                className="text-xs leading-relaxed text-muted-foreground"
              >
                {endpointLocked
                  ? `The ${providerDetails.label} endpoint is configured automatically.`
                  : "Enter the base URL for an OpenAI-compatible API."}
              </p>
            </div>

            <div className="grid gap-2">
              <label htmlFor="provider-settings-model" className="text-sm font-medium">
                Model
              </label>
              <Input
                id="provider-settings-model"
                value={connection.model}
                placeholder="provider/model-name"
                autoComplete="off"
                spellCheck={false}
                aria-describedby="provider-settings-model-description"
                onChange={(event) => updateConnection({ model: event.target.value })}
              />
              <p
                id="provider-settings-model-description"
                className="text-xs leading-relaxed text-muted-foreground"
              >
                Use the exact model identifier expected by this provider.
              </p>
            </div>

            <div className="grid gap-2">
              <label htmlFor="provider-settings-api-key" className="text-sm font-medium">
                API key
              </label>
              <Input
                id="provider-settings-api-key"
                type="password"
                value={connection.apiKey}
                disabled={apiKeyDisabled}
                placeholder={apiKeyDisabled ? "No API key required" : "Enter API key"}
                autoComplete="off"
                spellCheck={false}
                aria-describedby="provider-settings-api-key-description"
                onChange={(event) => updateConnection({ apiKey: event.target.value })}
              />
              <p
                id="provider-settings-api-key-description"
                className="text-xs leading-relaxed text-muted-foreground"
              >
                {apiKeyDisabled
                  ? "Ollama runs locally and does not require an API key."
                  : "Used only for requests sent to this provider."}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheckIcon className="size-3.5" />
            Stored for this browser session.
          </p>
          <DialogClose render={<Button size="sm" />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
