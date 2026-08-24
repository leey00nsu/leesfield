"use client";

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
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {(["primary", "reference"] as const).map((kind) => {
          const item = readiness[kind];
          return (
            <div
              key={kind}
              className={cn(
                "rounded-xl border px-3 py-2.5",
                kind === "primary"
                  ? "border-primary/20 bg-primary/5"
                  : "border-white/12 bg-white/[0.035]",
              )}
            >
              <span className="block text-white/45">{t(`edge.${kind}`)}</span>
              <span
                className={cn(
                  "mt-0.5 block font-semibold",
                  item.missingCount > 0
                    ? "text-amber-100"
                    : kind === "primary"
                      ? "text-primary"
                      : "text-white/70",
                )}
              >
                {readinessText(t, item)}
              </span>
              <span className="mt-1 block text-[10px] text-white/35">
                {t("input.connected", { count: item.connectedCount })}
              </span>
            </div>
          );
        })}
      </div>
      <p id="node-input-summary" className="sr-only" aria-live="polite">
        {description}
      </p>
    </section>
  );
}
