"use client";

import { useEffect } from "react";
import { logger } from "@/shared/logging/logger.mjs";
import { useTranslations } from "next-intl";
import { AppRouteHomeAction, AppRouteState } from "@/shared/ui/app-route-state";
import { AppButton } from "@/shared/ui/app-button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => { logger.error("ui.route.failed", error, {phase:"ui.render"}); }, [error]);
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
