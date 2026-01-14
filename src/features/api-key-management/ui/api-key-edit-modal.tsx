import { X } from "lucide-react";
import type { ApiKeyView } from "@/features/api-key-management/hook/use-api-key-management";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

type ApiKeyEditModalProps = {
  open: boolean;
  apiKey: ApiKeyView | null;
  label: string;
  error: string | null;
  isSaving: boolean;
  isRevoking: boolean;
  onLabelChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onRevoke: () => void;
};

export function ApiKeyEditModal({
  open,
  apiKey,
  label,
  error,
  isSaving,
  isRevoking,
  onLabelChange,
  onClose,
  onSave,
  onRevoke,
}: ApiKeyEditModalProps) {
  if (!apiKey) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}
    >
      <DialogContent className="w-[calc(100%-2rem)] max-w-xl rounded-2xl border-white/10 bg-surface-dark p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <DialogDescription className="text-xs font-mono uppercase tracking-widest text-gray-500">
              Edit API Key
            </DialogDescription>
            <DialogTitle className="mt-2 text-xl font-bold text-white">
              {apiKey.label}
            </DialogTitle>
            <p className="mt-1 text-xs font-mono text-gray-500">
              {apiKey.maskedKey}
            </p>
          </div>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              className="rounded-lg border border-white/10 p-2 text-gray-400 transition-colors hover:border-white/30 hover:text-white"
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogClose>
        </div>
        <div className="mt-6 space-y-3">
          <Label className="text-xs font-mono uppercase tracking-widest text-gray-500">
            Key Label
          </Label>
          <Input
            type="text"
            value={label}
            onChange={(event) => onLabelChange(event.target.value)}
            className="h-11 w-full rounded-xl border-white/10 bg-black/40 px-4 text-sm text-white focus-visible:ring-0 focus-visible:border-primary"
          />
          {error ? <p className="text-xs text-red-300">{error}</p> : null}
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            onClick={onRevoke}
            disabled={apiKey.status === "revoked" || isRevoking}
            variant="destructive"
            className={cn(
              "flex h-10 items-center justify-center rounded-full border border-red-500 px-6 text-xs font-bold uppercase tracking-wider text-white",
              "bg-red-500 transition-colors hover:bg-red-500 hover:text-white",
              "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-red-500",
            )}
          >
            {apiKey.status === "revoked"
              ? "Revoked"
              : isRevoking
                ? "Revoking..."
                : "Revoke Key"}
          </Button>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                className="rounded-full border border-white/10 px-5 py-2 text-xs font-bold uppercase tracking-wider text-gray-300 transition-colors hover:bg-white/10"
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              variant="default"
              className={cn(
                "rounded-full bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-black transition-colors hover:bg-primary hover:text-black",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
