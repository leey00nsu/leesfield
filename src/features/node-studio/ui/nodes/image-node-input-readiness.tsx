"use client";

import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";

import { useTranslations } from "next-intl";

import { cn } from "@/shared/lib/utils";

import type {
  ImageNodeInputReadiness,
  NodeInputKindReadiness,
} from "../../model/node-input-readiness";

function readinessText(
  t: ReturnType<typeof useTranslations<"nodeStudio">>,
  readiness: NodeInputKindReadiness,
) {
  if (readiness.connectedCount === 0) return t("input.none");
  if (readiness.missingCount > 0) {
    return t("input.selectionRequired", { count: readiness.missingCount });
  }
  return t("input.ready", {
    ready: readiness.readyCount,
    connected: readiness.connectedCount,
  });
}

export function ImageNodeInputReadinessView({
  readiness,
  compact = false,
}: {
  readiness: ImageNodeInputReadiness;
  compact?: boolean;
}) {
  const tc = useCanvasTranslation();
  const t = useTranslations("nodeStudio");
  const description = t("input.summary", {
    ready: readiness.readyCount,
    connected: readiness.connectedCount,
    resolved: readiness.resolvedCount,
  });

  if (compact) {
    return (
      <p
        className={cn(
          "mt-3 text-[10px] text-white/40",
          readiness.missingCount > 0 && "text-amber-100/75",
        )}
        aria-label={description}
      >
        {description}
      </p>
    );
  }

  return (
    <section aria-label={t("input.title")} aria-describedby="node-input-summary">
      <div className="text-[11px]">
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
          <span className="block text-white/45">{tc("Image")}</span>
          <span className={cn("mt-0.5 block font-semibold", readiness.missingCount > 0 ? "text-amber-100" : "text-primary") }>
            {readinessText(t, {
              connectedCount: readiness.connectedCount,
              readyCount: readiness.readyCount,
              missingCount: readiness.missingCount,
            })}
          </span>
          <span className="mt-1 block text-[10px] text-white/35">
            {t("input.connected", { count: readiness.connectedCount })}
          </span>
        </div>
      </div>
      <p id="node-input-summary" className="sr-only" aria-live="polite">
        {description}
      </p>
    </section>
  );
}
