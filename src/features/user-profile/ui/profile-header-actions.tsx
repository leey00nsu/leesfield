import { Button } from "@/shared/ui/button";

type ProfileHeaderActionsProps = {
  onCancel?: () => void;
  onSave?: () => void;
};

export function ProfileHeaderActions({
  onCancel,
  onSave,
}: ProfileHeaderActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        onClick={onCancel}
        variant="ghost"
        className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-surface-dark px-6 text-xs font-bold uppercase tracking-wider text-gray-400 transition-all hover:border-white hover:text-white"
      >
        Cancel
      </Button>
      <Button
        type="button"
        onClick={onSave}
        variant="default"
        className="flex h-10 items-center gap-2 rounded-full bg-primary px-6 text-xs font-bold uppercase tracking-wider text-black shadow-[0_0_15px_rgba(212,240,50,0.2)] transition-all hover:bg-primary-dark"
      >
        Save Changes
      </Button>
    </div>
  );
}
