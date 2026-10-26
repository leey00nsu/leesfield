"use client";
import { AppButton } from "@/shared/ui/app-button";
import { AppPageShell } from "@/shared/ui/app-page-shell";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { MonitoringKpiCards } from "@/features/monitoring-dashboard/ui/monitoring-kpi-cards";
import {
  createRangeFromDays,
} from "@/features/monitoring-dashboard/lib/format";
import type {
  MonitoringFilters as MonitoringFiltersState,
  MonitoringStatusFilter,
  MonitoringType,
} from "@/features/monitoring-dashboard/model/types";
import {
  useMonitoringOverview,
  useMonitoringApiKeys,
  useMonitoringStats,
} from "@/features/monitoring-dashboard/hook/use-monitoring-dashboard";
import { useRuntimeModelCatalog } from "@/shared/lib/hooks/use-runtime-model-catalog";
import {
  AppFilterSection,
  AppFilterToolbar,
} from "@/shared/ui/app-filter-toolbar";
import {
  AppSelectContent,
  AppSelectItem,
  AppSelectRoot,
  AppSelectTrigger,
  AppSelectValue,
} from "@/shared/ui/app-select";
import { AppDateTimePicker } from "@/shared/ui/app-calendar";

const statusFilters: MonitoringStatusFilter[] = [
  "all",
  "active",
  "pending",
  "processing",
  "uploading",
  "cancelled",
  "completed",
  "failed",
];

export function MonitoringRequestStatistics({ embedded = false }: { embedded?: boolean } = {}) {
  const tListControls = useTranslations("common.listControls");
  const t = useTranslations("monitoringDashboard");
  const tCommonLabels = useTranslations("common.labels");

  const initialRange = useMemo(() => createRangeFromDays(7), []);
  const [type, setType] = useState<MonitoringType>("all");
  const [status, setStatus] = useState<MonitoringStatusFilter>("all");
  const [model, setModel] = useState<string | null>(null);
  const [apiKeyId, setApiKeyId] = useState<string | null>(null);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const runtimeCatalog = useRuntimeModelCatalog();
  const apiKeysQuery = useMonitoringApiKeys();

  const tz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    [],
  );
  const modelOptions = useMemo(
    () =>
      runtimeCatalog.items
        .filter((item) => item.isActive&&(type==="all"||item.type===(type==="assistant"?"llm":type)))
        .map((item) => ({
          key: item.key,
          label: item.label,
          type: item.type,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [runtimeCatalog.items,type],
  );
  const apiKeyOptions = apiKeysQuery.data?.items ?? [];

  const filters: MonitoringFiltersState = useMemo(
    () => ({
      type,
      status,
      model,
      apiKeyId,
      query: null,
      from,
      to,
      tz,
    }),
    [apiKeyId, from, model, status, to, type, tz],
  );

  const overviewQuery = useMonitoringOverview(filters);
  const statsQuery = useMonitoringStats(filters);

  const stats = statsQuery.data?.items ?? [];
  const handleTypeChange = (nextType: MonitoringType) => {
    setType(nextType);
    setModel(null);
  };
  const handleStatusChange = (nextStatus: MonitoringStatusFilter) => {
    setStatus(nextStatus);
  };
  const handleModelChange = (value: string) => {
    setModel(value === "all" ? null : value);
  };
  const handleApiKeyChange = (value: string) => {
    setApiKeyId(value === "all" ? null : value);
  };
  const handleFromChange = (value: Date) => {
    setFrom(value);
  };
  const handleToChange = (value: Date) => {
    setTo(value);
  };

  return (
    <AppPageShell className={embedded ? "pt-0 sm:pt-0 pb-0" : undefined}>
      {!embedded && <h1 className="sr-only">{t("title.leading") + " " + t("title.accent")}</h1>}
      <div className="flex w-full min-w-0 flex-col gap-6">
        <AppFilterToolbar
          filters={
            <>
              <div className="grid min-w-0 gap-3" data-monitoring-filter-group="">
                <AppFilterSection label={tListControls("type")}>
                  <AppSelectRoot value={type} onValueChange={value=>handleTypeChange(value as MonitoringType)}><AppSelectTrigger surface="toolbar" triggerSize="md" aria-label={tListControls("type")} className="w-full"><AppSelectValue/></AppSelectTrigger><AppSelectContent>{(["all","image","video","audio","assistant"] as MonitoringType[]).map(item=><AppSelectItem key={item} value={item}>{item==="all"?tCommonLabels("all"):t("filters.type."+item)}</AppSelectItem>)}</AppSelectContent></AppSelectRoot>
                </AppFilterSection>

                <div className="grid min-w-0 gap-3">
                  <AppFilterSection label={t("filters.status")}>
                    <AppSelectRoot
                      value={status}
                      onValueChange={(value) =>
                        handleStatusChange(value as MonitoringStatusFilter)
                      }
                    >
                      <AppSelectTrigger
                        surface="toolbar"
                        triggerSize="md"
                        aria-label={t("filters.status")}
                        className="w-full"
                        style={{ height: 40 }}
                      >
                        <AppSelectValue placeholder={t("filters.status")} />
                      </AppSelectTrigger>
                      <AppSelectContent className="border-white/10 bg-card text-white">
                        {statusFilters.map((item) => (
                          <AppSelectItem key={item} value={item}>
                            {t(`filters.statuses.${item}`)}
                          </AppSelectItem>
                        ))}
                      </AppSelectContent>
                    </AppSelectRoot>
                  </AppFilterSection>
                  <AppFilterSection label={t("filters.model")}>
                    <AppSelectRoot
                      value={model ?? "all"}
                      onValueChange={handleModelChange}
                    >
                      <AppSelectTrigger
                        surface="toolbar"
                        triggerSize="md"
                        aria-label={t("filters.model")}
                        className="w-full"
                        style={{ height: 40 }}
                      >
                        <AppSelectValue placeholder={t("filters.model")} />
                      </AppSelectTrigger>
                      <AppSelectContent className="border-white/10 bg-card text-white">
                        <AppSelectItem value="all">
                          {t("filters.allModels")}
                        </AppSelectItem>
                        {modelOptions.map((item) => (
                          <AppSelectItem key={item.key} value={item.key}>
                            {item.label} · {t(`filters.type.${item.type === "llm" ? "assistant" : item.type}`)}
                          </AppSelectItem>
                        ))}
                      </AppSelectContent>
                    </AppSelectRoot>
                  </AppFilterSection>
                  <AppFilterSection label={t("filters.apiKey")}>
                    <AppSelectRoot
                      value={apiKeyId ?? "all"}
                      onValueChange={handleApiKeyChange}
                    >
                      <AppSelectTrigger
                        surface="toolbar"
                        triggerSize="md"
                        aria-label={t("filters.apiKey")}
                        className="w-full"
                        style={{ height: 40 }}
                      >
                        <AppSelectValue placeholder={t("filters.apiKey")} />
                      </AppSelectTrigger>
                      <AppSelectContent className="border-white/10 bg-card text-white">
                        <AppSelectItem value="all">
                          {t("filters.allApiKeys")}
                        </AppSelectItem>
                        <AppSelectItem value="ui">
                          {t("filters.uiRequests")}
                        </AppSelectItem>
                        {apiKeyOptions.map((item) => (
                          <AppSelectItem key={item.id} value={item.id}>
                            {item.maskedKey}
                          </AppSelectItem>
                        ))}
                      </AppSelectContent>
                    </AppSelectRoot>
                  </AppFilterSection>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3" data-monitoring-date-group="">
                <AppFilterSection label={t("filters.from")}>
                  <AppDateTimePicker
                    aria-label={t("filters.from")}
                    value={from}
                    onChange={handleFromChange}
                  />
                </AppFilterSection>
                <AppFilterSection label={t("filters.to")}>
                  <AppDateTimePicker
                    aria-label={t("filters.to")}
                    value={to}
                    onChange={handleToChange}
                  />
                </AppFilterSection>
              </div>
            </>
          }
          filterChips={[...(type !== "all" ? [{label: t("filters.type." + type), onRemove: () => handleTypeChange("all")}] : []), ...(status !== "all" ? [{label: t("filters.statuses." + status), onRemove: () => handleStatusChange("all")}] : []), ...(model ? [{label: modelOptions.find(item => item.key === model)?.label ?? model, onRemove: () => handleModelChange("all")}] : []), ...(apiKeyId ? [{label: apiKeyId === "ui" ? t("filters.uiRequests") : apiKeyOptions.find(item => item.id === apiKeyId)?.maskedKey ?? t("filters.apiKey"), onRemove: () => handleApiKeyChange("all")}] : []), ...(from !== initialRange.from || to !== initialRange.to ? [{label: from.toLocaleDateString() + " – " + to.toLocaleDateString(), onRemove: () => {setFrom(initialRange.from); setTo(initialRange.to);}}] : [])]}
          filterCount={
            Number(type !== "all") +
            Number(status !== "all") +
            Number(Boolean(model)) +
            Number(Boolean(apiKeyId)) +
            Number(from !== initialRange.from || to !== initialRange.to)
          }
          onResetFilters={() => {
            setType("all");
            setStatus("all");
            setModel(null);
            setApiKeyId(null);
            setFrom(initialRange.from);
            setTo(initialRange.to);
          }}
        />

        {(overviewQuery.isError || statsQuery.isError) && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm"><p>{t("stats.fetchError")}</p><AppButton variant="surface" size="sm" onClick={()=>{void overviewQuery.refetch();void statsQuery.refetch();}}>{t("stats.retry")}</AppButton></div>}
        <MonitoringKpiCards
          data={overviewQuery.data ?? null}
          stats={stats}
          statsLoading={statsQuery.isLoading}
          isLoading={overviewQuery.isLoading}
        />
      </div>
    </AppPageShell>
  );
}
