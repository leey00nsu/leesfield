import { AppButton } from "@/shared/ui/app-button";
import { useTranslations } from "next-intl";

interface ProfileHeaderActionsProps {
  onSave?: () => void;
}

export function ProfileHeaderActions({
  onSave,
}: ProfileHeaderActionsProps) {
  const tActions = useTranslations("profile.headerActions");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <AppButton
        type="button"
        onClick={onSave}
        disabled
        className="flex h-10 items-center gap-2 rounded-full bg-primary px-6 text-xs font-bold uppercase tracking-wider text-black shadow-[0_0_15px_rgba(212,240,50,0.2)] transition-all hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-primary"
      >
        {tActions("saveChanges")}
      </AppButton>
    </div>
  );
}
