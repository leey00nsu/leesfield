"use client";
import { PromptPresetInputText } from "@/entities/prompt-preset/ui/generation-prompt-preset-chip";
import { promptPresetDisplayName } from "@/shared/prompt-presets/prompt-preset-display-name";
import { ExecutionTime } from "@/shared/ui/execution-time";
import { useLocale, useTranslations } from "next-intl";
import { HistoryRequestSettings } from "../ui/history-request-settings";
import { Copy } from "lucide-react";
import type { GenerationHistoryItem, GenerationHistoryStatus } from "@/entities/generation/model/types";
import type { MonitoringRequestDetail } from "@/features/monitoring-dashboard/model/types";
import { useMonitoringRequestDetail } from "@/features/monitoring-dashboard/hook/use-monitoring-dashboard";
import { useCinemaHistory } from "@/shared/cinema/use-cinema-history";
import { CinemaHistoryDetails } from "@/shared/ui/cinema/cinema-history-details";
import { AppPromptMessage } from "@/shared/ui/app-prompt-message";
import { AppButton } from "@/shared/ui/app-button";
import { AppDetailSection } from "@/shared/ui/app-detail-rail";
import { AppExpandableText } from "@/shared/ui/app-expandable-text";
import { useClipboardCopy } from "@/shared/ui/use-clipboard-copy";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import type { AppTabItem } from "@/shared/ui/app-tabs";
const FINISHED_STATUSES = new Set(["completed", "failed", "cancelled"]);
const HISTORY_STATUSES = new Set<GenerationHistoryStatus>(["pending", "processing", "uploading", "completed", "failed", "cancelled"]);
function formatFallback(value: string | null | undefined) {
  return value?.trim() ? value : "-";
}

function toHistoryStatus(status: string): GenerationHistoryStatus | null {
  return HISTORY_STATUSES.has(status as GenerationHistoryStatus)
    ? (status as GenerationHistoryStatus)
    : null;
}

function hydrateHistoryItem(
  item: GenerationHistoryItem,
  detail: MonitoringRequestDetail | null | undefined,
): GenerationHistoryItem {
  if (!detail) return item;

  const resultUrl = detail.assets[0]?.url ?? item.resultUrl;
  return {
    ...item,
    id: detail.id,
    type: detail.type,
    status: toHistoryStatus(detail.status) ?? item.status,
    prompt: detail.prompt,
    model: detail.model,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    finishedAt: detail.finishedAt,
    durationMs: detail.durationMs,
    progress: detail.progress,
    resultUrl,
    imageVariants: detail.assets[0]?.imageVariants ?? item.imageVariants,
    thumbnailUrl:
      detail.type === "image" ? resultUrl : (item.thumbnailUrl ?? resultUrl),
    inputImages: detail.inputImages,
    inputAudios: detail.inputAudios,
    referenceText: detail.referenceText,
    errorMessage: detail.errorMessage,
  };
}

export function useGenerationDetailTabs(record: GenerationHistoryItem | null, output?: MediaAssetDto) {
  const emptyLabel = useTranslations("assets")("noGenerationInfo");
  const item: GenerationHistoryItem = record ?? {id:"",type:"image",status:"completed",prompt:"",model:null,createdAt:new Date(0).toISOString(),resultUrl:null,thumbnailUrl:null,errorMessage:null};
  const locale = useLocale();
  const tHistory = useTranslations("history");
  const tActions = useTranslations("history.detailActions");
  const tCinema = useTranslations("cinema");
  const tPresets = useTranslations("promptPresets");
  const cinemaHistory = useCinemaHistory(item.id, item.type, Boolean(record) && item.origin !== "edit");
  const copy = useClipboardCopy();
  const tStatuses = useTranslations("history.statuses");
  const tTypes = useTranslations("history.types");
  const detailQuery = useMonitoringRequestDetail(
    item.type,
    item.id,
    Boolean(record) && item.origin !== "edit",
  );
  const detail = detailQuery.data ?? null;
  const hydrated = hydrateHistoryItem(item, detail);
  const hydratedItem = output ? { ...hydrated, assetId: output.id, resultUrl: output.url, thumbnailUrl: output.url, imageVariants: output.imageVariants } : hydrated;
  const previewUrl = hydratedItem.resultUrl ?? hydratedItem.thumbnailUrl;
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const formatDateTime = (value: string | null | undefined) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return dateFormatter.format(parsed);
  };
  const finishedAt = hydratedItem.finishedAt ?? null;
  const finishedAtLabel =
    finishedAt && FINISHED_STATUSES.has(hydratedItem.status)
      ? formatDateTime(finishedAt)
      : "-";
  const inputImages = hydratedItem.inputImages ?? [];
  const inputAudios = hydratedItem.inputAudios ?? [];
  const resultLabel =
    hydratedItem.type === "audio"
      ? tHistory("detail.resultAudio")
      : hydratedItem.type === "video"
        ? tHistory("detail.resultVideo")
        : tHistory("detail.resultImage");
  const inputLabel =
    hydratedItem.type === "audio"
      ? tHistory("detail.inputAudio")
      : tHistory("detail.inputImage");
  const formattedRequestedAt = formatDateTime(hydratedItem.createdAt);
  const formattedDuration = <ExecutionTime {...hydratedItem} />;
  const resultUrl = hydratedItem.resultUrl ?? null;
  const thumbnailUrl =
    hydratedItem.thumbnailUrl ?? hydratedItem.resultUrl ?? null;
  const warningMessage = detail?.warningMessage ?? null;

  const settingsRows = [
    {
      label: tHistory("detail.model"),
      value: formatFallback(hydratedItem.model),
    },
    { label: tHistory("detail.type"), value: tTypes(hydratedItem.type) },
    {
      label: tHistory("detail.origin"),
      value: tHistory(`origins.${hydratedItem.origin ?? "generation"}`),
    },
    { label: tHistory("detail.status"), value: tStatuses(hydratedItem.status) },
  ];
  const metadataRows = [
    { label: tHistory("detail.requestId"), value: hydratedItem.id },
    { label: tHistory("detail.requestedAt"), value: formattedRequestedAt },
    { label: tHistory("detail.finishedAt"), value: finishedAtLabel },
    { label: tHistory("detail.duration"), value: formattedDuration },
    {
      label: tHistory("detail.assetId"),
      value: formatFallback(hydratedItem.assetId),
    },
    {
      label: tHistory("detail.graphId"),
      value: formatFallback(hydratedItem.graphId),
    },
    {
      label: tHistory("detail.graphNodeId"),
      value: formatFallback(hydratedItem.graphNodeId),
    },
    {
      label: tHistory("detail.sourceRecord"),
      value: hydratedItem.operation?.id ?? hydratedItem.id,
    },
    {
      label: tHistory("detail.sourceAssets"),
      value: hydratedItem.sourceAssetIds?.join(", ") || "-",
    },
  ];

  const primaryInputImage = inputImages[0] ?? null;
  const primaryInputAudio = inputAudios[0] ?? null;

  const renderMediaPreview = ({
    label,
    url,
    type,
    empty,
  }: {
    label: string;
    url: string | null;
    type: GenerationHistoryItem["type"];
    empty: string;
  }) => (
    <div className="rounded-xl border border-white/10 bg-black/18 p-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-widest text-gray-500">
        <span>{label}</span>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] font-semibold tracking-normal text-white/48 hover:text-primary"
          >
            {tHistory("detail.openAsset")}
          </a>
        ) : null}
      </div>
      {url ? (
        type === "audio" ? (
          <div className="flex min-h-24 items-center rounded-lg bg-black/45 p-3">
            <audio controls className="w-full" src={url} />
          </div>
        ) : type === "video" ? (
          <video
            controls
            className="h-36 w-full rounded-lg bg-black/45 object-contain"
            src={url}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={label}
            loading="lazy"
            className="h-36 w-full rounded-lg bg-black/45 object-contain"
          />
        )
      ) : (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-white/10 text-sm text-white/36">
          {empty}
        </div>
      )}
    </div>
  );



  const renderRows = (rows: Array<{ label: string; value: import("react").ReactNode }>) => (
    <dl className="grid gap-3 text-sm">
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-3"
        >
          <dt className="text-white/42">{row.label}</dt>
          <dd className="min-w-0 break-words text-right font-semibold text-white">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );

  const appliedPreset = cinemaHistory.data?.promptPreset;
  const presetName = appliedPreset ? promptPresetDisplayName(appliedPreset, tPresets) : "";
  const promptTab = (
    <div className="grid gap-5">

      {cinemaHistory.error && <AppPromptMessage>{tCinema("restoreFailed")}</AppPromptMessage>}
      {[
        { label: tHistory("detail.inputPrompt"), text: cinemaHistory.data?.inputPrompt, preset: appliedPreset, unavailable: cinemaHistory.loading ? tHistory("detail.promptLoading") : tHistory("detail.inputPromptUnknown") },
        { label: tHistory("detail.fullPrompt"), text: hydratedItem.prompt },
      ].map(({ label, text, preset, unavailable }) => {
        const copyText = preset ? (text ?? "").slice(0, preset.tokenOffset) + "[" + presetName + "] " + (text ?? "").slice(preset.tokenOffset) : text;
        return <div key={label} className="grid gap-3">
        <div className="flex items-center justify-between gap-3 text-sm font-semibold text-white">
          <span>{label}</span>
          <AppButton type="button" variant="surface" size="sm" disabled={!copyText} onClick={() => copyText && copy(copyText)} className="h-8 rounded-lg px-2.5 text-xs">
            <Copy className="h-3.5 w-3.5" />{tActions("copy")}
          </AppButton>
        </div>
        <AppExpandableText textValue={copyText ?? ""} collapsedLines={4} showMoreLabel={tHistory("detail.showMore")} showLessLabel={tHistory("detail.showLess")}
          className="rounded-xl border border-white/10 bg-black/18 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" bodyClassName="text-sm leading-6 text-white/68">
          {preset ? <PromptPresetInputText preset={preset} text={text ?? ""} /> : text == null ? unavailable : text || tHistory("detail.noInputPrompt")}
        </AppExpandableText>
      </div>; })}

      {hydratedItem.referenceText ? (
        <div className="grid gap-3">
          <div className="text-sm font-semibold text-white">
            {tHistory("detail.referenceText")}
          </div>
          <AppExpandableText
            collapsedLines={3}
            showMoreLabel={tHistory("detail.showMore")}
            showLessLabel={tHistory("detail.showLess")}
            className="rounded-xl border border-white/10 bg-black/18 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            bodyClassName="text-sm leading-6 text-white/68"
          >
            {hydratedItem.referenceText}
          </AppExpandableText>
        </div>
      ) : null}
    </div>
  );

  const settingsTab = (
    <AppDetailSection className="p-4">
      {renderRows(settingsRows)}
      {cinemaHistory.data?.cinema && <CinemaHistoryDetails snapshot={cinemaHistory.data.cinema} />}
      <HistoryRequestSettings parameters={detail?.requestParameters} loading={detailQuery.isLoading} error={detailQuery.isError} />
    </AppDetailSection>
  );

  const metadataTab = (
    <AppDetailSection className="p-4">
      {renderRows(metadataRows)}
    </AppDetailSection>
  );

  const sourceRows = [
    { label: tHistory("detail.origin"), value: output?.origin === "upload" ? tHistory("origins.upload") : tHistory(`origins.${item.origin ?? (output?.origin === "media_operation" ? "edit" : "generation")}`) },
    { label: tHistory(record ? "detail.requestedAt" : "detail.recordedAt"), value: formatDateTime(record ? hydratedItem.createdAt : output?.createdAt) },
    ...(record ? [{ label: tHistory("detail.sourceRecord"), value: item.operation?.id ?? item.id }, { label: tHistory("detail.graphId"), value: formatFallback(item.graphId) }, { label: tHistory("detail.sourceAssets"), value: item.sourceAssetIds?.join(", ") || "-" }] : []),
  ];
  const provenance = <AppDetailSection className="p-4">{renderRows(sourceRows)}</AppDetailSection>;
  const historyTab = (
    <div className="grid gap-3">
      {provenance}
      {renderMediaPreview({
        label: inputLabel,
        url:
          hydratedItem.type === "audio" ? primaryInputAudio : primaryInputImage,
        type: hydratedItem.type === "audio" ? "audio" : "image",
        empty: tHistory("detail.noInputAsset"),
      })}
      {hydratedItem.errorMessage ? (
        <div className="grid gap-2">
          <div className="text-sm font-semibold text-red-100">
            {tHistory("detail.errorMessage")}
          </div>
          <AppExpandableText
            collapsedLines={3}
            showMoreLabel={tHistory("detail.showMore")}
            showLessLabel={tHistory("detail.showLess")}
            className="rounded-xl border border-red-300/20 bg-red-500/10 p-4"
            bodyClassName="text-sm leading-6 text-red-50/80"
          >
            {hydratedItem.errorMessage}
          </AppExpandableText>
        </div>
      ) : null}
      {warningMessage ? (
        <div className="grid gap-2">
          <div className="text-sm font-semibold text-amber-100">
            {tHistory("detail.warningMessage")}
          </div>
          <AppExpandableText
            collapsedLines={3}
            showMoreLabel={tHistory("detail.showMore")}
            showLessLabel={tHistory("detail.showLess")}
            className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-4"
            bodyClassName="text-sm leading-6 text-amber-50/80"
          >
            {warningMessage}
          </AppExpandableText>
        </div>
      ) : null}
      {hydratedItem.operation ? (
        <div className="grid gap-2 rounded-xl border border-white/10 bg-black/18 p-4">
          <div className="text-sm font-semibold text-white">
            {tHistory("detail.operationParameters")}
          </div>
          <p className="text-xs text-white/55">
            {hydratedItem.operation.type} · v
            {hydratedItem.operation.configVersion}
          </p>
          <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-5 text-white/58">
            {JSON.stringify(hydratedItem.operation.parameters, null, 2)}
          </pre>
        </div>
      ) : null}
      {renderMediaPreview({
        label: resultLabel,
        url: thumbnailUrl ?? resultUrl,
        type: hydratedItem.type,
        empty: tHistory("detail.noResultAsset"),
      })}
    </div>
  );

  const tabs: AppTabItem[] = [{value:"prompt",label:tHistory("detail.tabPrompt"),content:promptTab},{value:"settings",label:tHistory("detail.tabSettings"),content:settingsTab},{value:"metadata",label:tHistory("detail.tabMetadata"),content:metadataTab},{value:"history",label:tHistory("detail.tabHistory"),content:historyTab}];
  return { item: hydratedItem, detailQuery, previewUrl, tabs: record ? tabs : tabs.map(tab => ({...tab,content:tab.value === "history" && output ? provenance : <p className="text-sm text-muted-foreground">{emptyLabel}</p>})) };
}
