"use client";

import { useTranslations } from "next-intl";
import { AppRouteHomeAction, AppRouteState } from "@/shared/ui/app-route-state";
import { AppButton } from "@/shared/ui/app-button";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("routeState");
  return (
    <AppRouteState
      eyebrow={t("error")}
      title={t("errorTitle")}
      description={t("errorDescription")}
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <AppButton type="button" className="rounded-full px-7" onClick={reset}>
            {t("retry")}
          </AppButton>
          <AppRouteHomeAction label={t("home")} />
        </div>
      }
    />
  );
}
