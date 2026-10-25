"use client";

import { useShallow } from "zustand/react/shallow";
import { Fragment, useEffect, useRef, useState } from "react";
import { BoxIcon, SparklesIcon, PlusIcon, LockKeyholeIcon } from "lucide-react";
import { defaultFilter } from "cmdk";
import { Button } from "@/components/ui/button";
import { ApiKeyDialog, ApiKeySettingsButton } from "./model-api-key-settings";
import {
  defaultModel,
  modelProviders,
  type ModelProviderId,
  type AssistantModel,
  type SharedKeyProvider,
} from "../config/models";
import { AddModelDialog } from "./add-model-dialog";
import { getModelConnection } from "../runtime/model-config";
import { ModelActionsButton, ModelActionDialog, type ModelAction } from "./model-actions";
import { useModels } from "./model-provider";
import { useThreadModels } from "./model-thread-provider";
import { ClaudeLogo, OllamaLogo, OpenAILogo, OpenRouterLogo } from "./assistant-ui/elements/logos";
import {
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorRoot,
  ModelSelectorSearch,
  ModelSelectorSeparator,
  ModelSelectorTrigger,
  type ModelOption,
} from "./assistant-ui/elements/model-selector";

const providerLogos = {
  openai: OpenAILogo,
  openrouter: OpenRouterLogo,
  anthropic: ClaudeLogo,
  ollama: OllamaLogo,
  custom: BoxIcon,
};

function toModelOption(model: AssistantModel, modelId: string) {
  const Logo = providerLogos[model.provider];
  const provider = modelProviders.find((provider) => provider.id === model.provider)!;
  return {
    ...model,
    icon: (
      <Logo
        className={`size-3.5 object-contain ${model.provider === "ollama" || model.provider === "openrouter" ? "dark:invert" : ""}`}
      />
    ),
    keywords: [provider.name, model.provider, modelId],
  };
}

// Keep the alias distinct so selecting it does not also check the target model.
const defaultOption = {
  ...defaultModel,
  icon: <SparklesIcon className="size-3.5 text-muted-foreground" />,
};

export function AssistantModelSelector() {
  const {
    allModels,
    connections,
    addModel,
    updateModel,
    removeModel,
    providerApiKeys,
    setProviderApiKey,
    customApiKeys,
    setCustomApiKey,
    getApiKey,
  } = useModels(
    useShallow((state) => ({
      allModels: state.allModels,
      connections: state.connections,
      addModel: state.addModel,
      updateModel: state.updateModel,
      removeModel: state.removeModel,
      providerApiKeys: state.providerApiKeys,
      setProviderApiKey: state.setProviderApiKey,
      customApiKeys: state.customApiKeys,
      setCustomApiKey: state.setCustomApiKey,
      getApiKey: state.getApiKey,
    })),
  );
  const { selectedModel, locked, selectModel } = useThreadModels();
  const [actionTarget, setActionTarget] = useState<{
    model: AssistantModel;
    action: ModelAction;
  } | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [keyTarget, setKeyTarget] = useState<{
    name: string;
    provider?: SharedKeyProvider;
    modelId?: string;
  } | null>(null);
  const managingModelRef = useRef(false);
  useEffect(() => {
    if (!locked) return;
    setSelectorOpen(false);
    setActionTarget(null);
    setKeyTarget(null);
    setAddDialogOpen(false);
    managingModelRef.current = false;
  }, [locked]);
  function editKey(target: NonNullable<typeof keyTarget>) {
    if (locked) return;
    managingModelRef.current = true;
    setKeyTarget(target);
    setSelectorOpen(false);
  }
  function closeKeyDialog() {
    setKeyTarget(null);
    setSelectorOpen(true);
    managingModelRef.current = false;
  }
  function openModelAction(model: AssistantModel, action: ModelAction) {
    if (locked) return;
    managingModelRef.current = true;
    setActionTarget({ model, action });
    setSelectorOpen(false);
  }
  function closeModelAction() {
    setActionTarget(null);
    setSelectorOpen(true);
    managingModelRef.current = false;
  }
  const models = allModels.map((model) => ({
    ...toModelOption(model, getModelConnection(model, connections).modelId),
    disabled: model.provider !== "ollama" && !getApiKey(model)?.trim(),
  }));
  const selectorModels: ModelOption[] = [defaultOption, ...models];
  if (!selectorModels.some((model) => model.id === selectedModel)) {
    selectorModels.push({
      id: selectedModel,
      name: `${selectedModel} (unavailable)`,
      disabled: true,
    });
  }
  const [provider, setProvider] = useState<ModelProviderId | "all">("all");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const query = search.trim();
  const showDefault =
    provider === "all" && defaultFilter(defaultOption.id, query, [defaultOption.name]) > 0;
  const matchingModels = models.filter(
    (model) =>
      (provider === "all" || model.provider === provider) &&
      defaultFilter(model.id, query, [model.name, ...model.keywords]) > 0,
  );
  // Keep Custom Model last even when its search score is higher.
  const groups = [
    ...modelProviders.filter((item) => item.id !== "custom"),
    ...modelProviders.filter((item) => item.id === "custom"),
  ]
    .map((item) => ({
      ...item,
      models: matchingModels.filter((model) => model.provider === item.id),
    }))
    .filter((item) => item.models.length > 0);

  return (
    <>
      <ModelSelectorRoot
        models={selectorModels}
        value={selectedModel}
        onValueChange={(id) => {
          const model = selectorModels.find((item) => item.id === id);
          if (!locked && model && !("disabled" in model && model.disabled)) selectModel(id);
        }}
        open={selectorOpen && !locked}
        onOpenChange={(open) => {
          setSelectorOpen(open && !locked);
          if (!open && !managingModelRef.current) {
            setSearch("");
            setProvider("all");
          }
        }}
      >
        <ModelSelectorTrigger
          variant="ghost"
          size="sm"
          aria-label="Select model"
          disabled={locked}
          className="h-7 max-w-48 rounded-lg border-0 px-2 shadow-none"
        />
        <ModelSelectorContent
          side="top"
          align="start"
          searchable
          shouldFilter={false}
          aria-label="Model selector"
          className="w-[min(20rem,calc(100vw-2rem))] gap-0"
        >
          <div className="flex shrink-0 items-center gap-2 p-2">
            <div className="min-w-0 flex-1 [&>[data-slot=command-input-wrapper]]:p-0">
              <ModelSelectorSearch
                ref={searchRef}
                value={search}
                onValueChange={setSearch}
                aria-label="Search models"
                placeholder="Search models..."
              />
            </div>

            <Button
              type="button"
              size="xs"
              className="h-8 shrink-0 bg-blue-600 text-white hover:bg-blue-500"
              onKeyDown={(event) => event.stopPropagation()}
              onClick={() => {
                setSelectorOpen(false);
                setSearch("");
                setProvider("all");
                setAddDialogOpen(true);
              }}
            >
              <PlusIcon className="size-3.5" />
              Add models
            </Button>
          </div>
          <div
            role="group"
            aria-label="Filter by provider"
            className="flex shrink-0 gap-1 overflow-x-auto overscroll-x-contain border-b p-2"
            onKeyDown={(event) => event.stopPropagation()}
          >
            {[{ id: "all", name: "All" } as const, ...modelProviders].map((item) => {
              const Logo = item.id === "all" ? null : providerLogos[item.id];
              return (
                <Button
                  key={item.id}
                  type="button"
                  className="grow"
                  variant={provider === item.id ? "secondary" : "ghost"}
                  size="xs"
                  aria-pressed={provider === item.id}
                  onClick={() => {
                    setProvider(item.id);
                    searchRef.current?.focus();
                  }}
                >
                  {Logo && (
                    <Logo
                      className={`size-3 object-contain ${item.id === "ollama" || item.id === "openrouter" ? "dark:invert" : ""}`}
                    />
                  )}
                  {item.name}
                </Button>
              );
            })}
          </div>
          <ModelSelectorList className="h-56">
            <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
            {showDefault && <ModelSelectorItem model={defaultOption} />}
            {groups.map((item, index) => (
              <Fragment key={item.id}>
                {item.id === "custom" && (showDefault || index > 0) && (
                  <ModelSelectorSeparator alwaysRender />
                )}
                <div className="relative">
                  <ModelSelectorGroup heading={item.name}>
                    {item.id !== "ollama" && item.id !== "custom" && !providerApiKeys[item.id] && (
                      <p className="flex items-center gap-1.5 px-3 pb-1 text-xs text-muted-foreground">
                        <LockKeyholeIcon className="size-3" /> Set API key to enable models via Gear
                        icon.
                      </p>
                    )}
                    {item.models.map((model) => (
                      <div key={model.id} className="flex items-start gap-1">
                        <ModelSelectorItem model={model} className="min-w-0 flex-1" />
                        {model.disabled && (
                          <LockKeyholeIcon
                            aria-label="API key required"
                            className="mt-3 size-3 shrink-0 text-muted-foreground"
                          />
                        )}
                        <ModelActionsButton
                          model={model}
                          hasKey={!!customApiKeys[model.id]}
                          onAction={(action) => openModelAction(model, action)}
                          onEditKey={
                            model.provider === "custom"
                              ? () => editKey({ name: model.name, modelId: model.id })
                              : undefined
                          }
                        />
                      </div>
                    ))}
                  </ModelSelectorGroup>
                  {item.id !== "ollama" && item.id !== "custom" && (
                    <ApiKeySettingsButton
                      name={item.name}
                      hasKey={!!providerApiKeys[item.id]}
                      className="absolute right-1 top-1 text-muted-foreground"
                      onEdit={() => editKey({ name: item.name, provider: item.id })}
                    />
                  )}
                </div>
              </Fragment>
            ))}
          </ModelSelectorList>
        </ModelSelectorContent>
      </ModelSelectorRoot>
      {actionTarget && !locked && (
        <ModelActionDialog
          key={`${actionTarget.action}/${actionTarget.model.id}`}
          model={actionTarget.model}
          action={actionTarget.action}
          models={allModels}
          connections={connections}
          providerApiKeys={providerApiKeys}
          customApiKey={customApiKeys[actionTarget.model.id]}
          onClose={closeModelAction}
          onSave={(model, connection, apiKey) => {
            if (locked) return;
            updateModel(actionTarget.model.id, model, connection, apiKey);
            closeModelAction();
          }}
          onDelete={() => {
            if (locked) return;
            removeModel(actionTarget.model.id);
            closeModelAction();
          }}
        />
      )}
      {keyTarget && !locked && (
        <ApiKeyDialog
          name={keyTarget.name}
          apiKey={
            keyTarget.provider
              ? (providerApiKeys[keyTarget.provider] ?? "")
              : (customApiKeys[keyTarget.modelId!] ?? "")
          }
          onClose={closeKeyDialog}
          onSave={(apiKey) => {
            if (locked) return;
            if (keyTarget.provider) setProviderApiKey(keyTarget.provider, apiKey);
            else setCustomApiKey(keyTarget.modelId!, apiKey);
            closeKeyDialog();
          }}
        />
      )}
      <AddModelDialog
        open={addDialogOpen && !locked}
        onOpenChange={setAddDialogOpen}
        models={allModels}
        connections={connections}
        providerApiKeys={providerApiKeys}
        onAdd={(model, connection, apiKey) => {
          if (locked) return;
          addModel(model, connection, apiKey);
          selectModel(model.id);
          setAddDialogOpen(false);
        }}
      />
    </>
  );
}
