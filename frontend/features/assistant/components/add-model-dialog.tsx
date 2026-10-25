"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AssistantModel, ModelConnection, ProviderApiKeys } from "../config/models";
import { ModelForm } from "./model-form";

type AddModelDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: readonly AssistantModel[];
  providerApiKeys: ProviderApiKeys;
  connections: ReadonlyMap<string, ModelConnection>;
  onAdd: (model: AssistantModel, connection: ModelConnection, apiKey: string) => void;
};

export function AddModelDialog({
  open,
  onOpenChange,
  models,
  providerApiKeys,
  connections,
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
        <ModelForm
          models={models}
          providerApiKeys={providerApiKeys}
          connections={connections}
          onSave={(model, connection, apiKey) => onAdd(model, connection, apiKey ?? "")}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
