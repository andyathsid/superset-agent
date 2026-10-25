"use client";

import { useState } from "react";
import { EllipsisIcon, PencilIcon, SettingsIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AssistantModel, ModelConnection, ProviderApiKeys } from "../config/models";
import { ModelForm } from "./model-form";

export type ModelAction = "edit" | "delete";

export function ModelActionsButton({
  model,
  onAction,
  onEditKey,
  hasKey,
}: {
  model: AssistantModel;
  onAction: (action: ModelAction) => void;
  onEditKey?: () => void;
  hasKey: boolean;
}) {
  const [open, setOpen] = useState(false);
  function run(action: () => void) {
    setOpen(false);
    action();
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="mt-1.5 shrink-0 text-muted-foreground"
            aria-label={`Manage ${model.name}`}
            onKeyDown={(event) => event.stopPropagation()}
          />
        }
      >
        <EllipsisIcon className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-44 gap-0 p-1"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => run(() => onAction("edit"))}
        >
          <PencilIcon /> Edit model
        </Button>
        {onEditKey && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => run(onEditKey)}
          >
            <SettingsIcon /> {hasKey ? "Update API key" : "Set API key"}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start text-destructive hover:text-destructive"
          onClick={() => run(() => onAction("delete"))}
        >
          <Trash2Icon /> Delete model
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function ModelActionDialog({
  model,
  action,
  models,
  connections,
  providerApiKeys,
  customApiKey,
  onClose,
  onSave,
  onDelete,
}: {
  model: AssistantModel;
  action: ModelAction;
  models: readonly AssistantModel[];
  connections: ReadonlyMap<string, ModelConnection>;
  providerApiKeys: ProviderApiKeys;
  customApiKey?: string;
  onClose: () => void;
  onSave: (model: AssistantModel, connection: ModelConnection, apiKey?: string) => void;
  onDelete: () => void;
}) {
  const deleting = action === "delete";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
        finalFocus={() =>
          document.querySelector<HTMLInputElement>('[aria-label="Search models"]') ??
          document.querySelector<HTMLElement>('[data-slot="model-selector-trigger"]')
        }
      >
        <DialogHeader className="pr-6">
          <DialogTitle>{deleting ? "Delete model" : "Edit model"}</DialogTitle>
          <DialogDescription>
            {deleting
              ? `Remove ${model.name} from this session? This cannot be undone in this session.`
              : "Update the model and connection for this session. Reloading clears changes."}
          </DialogDescription>
        </DialogHeader>
        {deleting ? (
          <DialogFooter className="flex-row justify-end">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={onDelete}>
              Delete model
            </Button>
          </DialogFooter>
        ) : (
          <ModelForm
            model={model}
            initialApiKey={customApiKey}
            models={models}
            connections={connections}
            providerApiKeys={providerApiKeys}
            onSave={onSave}
            onCancel={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
