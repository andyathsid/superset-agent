"use client";

import { useId, useState, type FormEvent } from "react";
import { EllipsisIcon, PencilIcon, SettingsIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AssistantModel } from "../config/models";

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
  onClose,
  onSave,
  onDelete,
}: {
  model: AssistantModel;
  action: ModelAction;
  onClose: () => void;
  onSave: (changes: Pick<AssistantModel, "name" | "description">) => void;
  onDelete: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(model.name);
  const [description, setDescription] = useState(model.description);
  const [error, setError] = useState("");
  const deleting = action === "delete";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a model name. Spaces alone are not allowed.");
      return;
    }
    onSave({ name: name.trim(), description: description.trim() });
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
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
              : "Update the display name and description for this session. The Model ID stays the same."}
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
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-1.5">
              <label htmlFor={`${id}-name`} className="text-sm font-medium">
                Name
              </label>
              <Input
                id={`${id}-name`}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={!!error}
                aria-describedby={error ? `${id}-error` : undefined}
              />
              {error && (
                <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={`${id}-description`} className="text-sm font-medium">
                Description
              </label>
              <Textarea
                id={`${id}-description`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <DialogFooter className="flex-row justify-end">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" className="bg-blue-600 text-white hover:bg-blue-500">
                Save changes
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
