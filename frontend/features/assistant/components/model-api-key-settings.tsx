"use client";

import { useId, useState, type FormEvent } from "react";
import { EyeIcon, EyeOffIcon, SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ApiKeySettingsButton({
  name,
  hasKey,
  className,
  onEdit,
}: {
  name: string;
  hasKey: boolean;
  className?: string;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className={className}
                  aria-label={`API key settings for ${name}`}
                  onKeyDown={(event) => event.stopPropagation()}
                />
              }
            />
          }
        >
          <SettingsIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent>Manage API key for {name}</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        className="w-40 p-1"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => {
            setOpen(false);
            onEdit();
          }}
        >
          {hasKey ? "Update API key" : "Set API key"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function ApiKeyDialog({
  name,
  apiKey,
  onClose,
  onSave,
}: {
  name: string;
  apiKey: string;
  onClose: () => void;
  onSave: (key: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(apiKey);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) {
      setError("Enter an API key. Spaces alone are not allowed.");
      return;
    }
    onSave(draft.trim());
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
          <DialogTitle>{apiKey ? "Update API key" : "Set API key"}</DialogTitle>
          <DialogDescription>
            {name}. Saved for this session only. No connection check is performed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor={id} className="text-sm font-medium">
              API key
            </label>
            <div className="relative">
              <Input
                id={id}
                type={visible ? "text" : "password"}
                required
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="pr-10"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={!!error}
                aria-describedby={error ? `${id}-error` : undefined}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-0.5 top-0.5"
                aria-label={visible ? "Hide API key" : "Show API key"}
                aria-pressed={visible}
                onClick={() => setVisible((value) => !value)}
              >
                {visible ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
              </Button>
            </div>
            {error && (
              <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="flex-row justify-end">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-blue-600 text-white hover:bg-blue-500">
              Save API key
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
