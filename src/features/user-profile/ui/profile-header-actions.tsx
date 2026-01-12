import { Button } from "@/shared/ui/button";

type ProfileHeaderActionsProps = {
  onSave?: () => void;
};

export function ProfileHeaderActions({
  onSave,
}: ProfileHeaderActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
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
