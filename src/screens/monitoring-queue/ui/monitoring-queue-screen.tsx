"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/shared/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { useMonitoringQueue } from "@/features/monitoring-queue/hook/use-monitoring-queue";

export function MonitoringQueueScreen() {
  const tMonitoring = useTranslations("monitoringQueue");
  const tCommonLabels = useTranslations("common.labels");
  const tCommonActions = useTranslations("common.actions");
  const {
    items,
    updatedAt,
    isLoading,
    error,
  } = useMonitoringQueue();

  const lastUpdatedLabel = useMemo(() => {
    if (!updatedAt) return tCommonLabels("unknown");
    return new Date(updatedAt).toLocaleString();
  }, [tCommonLabels, updatedAt]);

  return (
    <div className="flex flex-col gap-8 pb-20 overflow-x-hidden">
      <PageHeader
        title={
          <>
            <span className="text-white">{tMonitoring("title.leading")}</span>{" "}
            <span className="text-primary">{tMonitoring("title.accent")}</span>
          </>
        }
        subtitle={tMonitoring("subtitle")}
        rightSlot={
          <div className="flex flex-col items-start gap-1 rounded-2xl border border-white/10 bg-surface-dark px-4 py-3 text-xs font-mono text-gray-400">
            <span className="uppercase tracking-widest text-gray-500">
              {tMonitoring("lastUpdated")}
            </span>
            <span className="text-sm font-semibold text-white">
              {lastUpdatedLabel}
            </span>
          </div>
        }
      />

      <div className="mx-auto w-full max-w-[1600px]">
        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-sm text-red-200">
            {tMonitoring("error")}
          </div>
        ) : items.length === 0 && !isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-surface-dark px-6 py-6 text-sm text-gray-300">
            <div className="text-base font-semibold text-white">
              {tMonitoring("empty.title")}
            </div>
            <div className="mt-1 text-sm text-gray-400">
              {tMonitoring("empty.default")}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <Card key={`${item.type}-${item.model}`} className="border-white/10 bg-surface-dark/80 text-white">
                <CardHeader className="border-b border-white/5 pb-4">
                  <CardTitle className="text-xs font-mono uppercase tracking-widest text-gray-500">
                    {item.type === "image"
                      ? tCommonLabels("images")
                      : tCommonLabels("videos")}
                  </CardTitle>
                  <div className="text-lg font-semibold text-white">
                    {item.model}
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-white/10 bg-background-dark/60 px-4 py-3">
                    <div className="text-xs font-mono uppercase tracking-widest text-gray-500">
                      {tMonitoring("pending")}
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-white">
                      {item.pending}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-background-dark/60 px-4 py-3">
                    <div className="text-xs font-mono uppercase tracking-widest text-gray-500">
                      {tMonitoring("processing")}
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-white">
                      {item.processing}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {isLoading && !error && (
          <div className="mt-6 text-xs font-mono uppercase tracking-widest text-gray-500">
            {tCommonActions("loading")}
          </div>
        )}
      </div>
    </div>
  );
}
