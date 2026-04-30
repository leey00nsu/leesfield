"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AudioLines,
  Grid2X2,
  Image as ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Video,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  filterModelCatalog,
  type ModelCatalogFilterType,
  type ModelCatalogItem,
} from "@/features/model-management/model/model-catalog";
import { ModelList } from "@/features/model-management/ui/model-list";
import { AppButton } from "@/shared/ui/app-button";
import { Button } from "@/shared/ui/button";
import { DashboardCtaButton } from "@/shared/ui/dashboard-cta-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  PageHeader,
  PageHeaderSearchInput,
} from "@/shared/ui/page-header";
import { Textarea } from "@/shared/ui/textarea";
import { useDebouncedValue } from "@/shared/lib/hooks/use-debounced-value";
import {
  DashboardFilterBar,
  DashboardFilterDivider,
  DashboardFilterToggle,
} from "@/shared/ui/dashboard-filter-bar";

const DEFAULT_VENDOR = "HUGGINGFACE";
const DEFAULT_PROVIDER = "hf_space";

type ModelType = "image" | "video" | "audio";
type VendorOption = "HUGGINGFACE" | "API";

const vendorOptions: Array<{ value: VendorOption; disabled?: boolean }> = [
  { value: "HUGGINGFACE" },
  { value: "API", disabled: true },
];

type AdminModelRecord = {
  id: string;
  type: ModelType;
  key: string;
  label: string;
  vendor: string;
  provider: string;
  providerConfig: Record<string, unknown>;
  parameters: Record<string, unknown>;
  meta: Record<string, unknown>;
  isActive: boolean;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type ModelDraft = {
  type: ModelType;
  key: string;
  label: string;
  vendor: string;
  provider: string;
  isActive: boolean;
  isDefault: boolean;
  providerConfigText: string;
  parametersText: string;
  metaText: string;
};

type JsonErrors = {
  providerConfig?: string;
  parameters?: string;
  meta?: string;
};

const defaultImageProviderConfig = {
  space_id: "owner/space",
  api_name: "/generate_image",
  timeout_ms: 300000,
  input_images_format: "file_array",
};

const defaultVideoProviderConfig = {
  space_id: "owner/space",
  api_name: "/generate_video",
  timeout_ms: 300000,
};

const defaultAudioProviderConfig = {
  space_id: "owner/space",
  api_name: "/run_generation",
  timeout_ms: 300000,
};

const defaultImageParameters = {
  prompt: { ui: "textarea", required: true },
  width: { ui: "input", min: 512, max: 2048, step: 1, default: 1024 },
  height: { ui: "input", min: 512, max: 2048, step: 1, default: 1024 },
  steps: { ui: "range", min: 1, max: 30, step: 1, default: 10 },
  seed: { ui: "input", default: "" },
  imageCount: { ui: "hidden", min: 1, max: 1, default: 1 },
};

const defaultVideoParameters = {
  prompt: { ui: "textarea", required: true },
  initImage: { ui: "upload", required: true },
  durationSec: { ui: "range", min: 1, max: 6, step: 0.5, default: 3 },
  steps: { ui: "range", min: 4, max: 10, step: 1, default: 6 },
  guidanceScale: { ui: "range", min: 0, max: 10, step: 0.5, default: 1 },
  seed: { ui: "input", default: "" },
  aspectRatio: { ui: "select", options: ["16:9", "9:16", "1:1"], default: "16:9" },
  resolution: { ui: "select", options: [480, 640, 720, 832], default: 720 },
  fps: { ui: "hidden", min: 16, max: 16, step: 1, default: 16 },
};

const defaultAudioParameters = {
  prompt: { ui: "textarea", required: true },
  voice: { ui: "input", default: "default" },
  speed: { ui: "range", min: 0.25, max: 4, step: 0.05, default: 1 },
  seed: { ui: "input", default: "" },
  inputAudio: { ui: "upload" },
  referenceText: { ui: "textarea" },
};

const defaultImageMeta = {
  pipeline: "diffusion",
  model_id: "owner/model",
  default_width: 1024,
  default_height: 1024,
  default_steps: 10,
  concurrent_limit: 1,
  max_input_images: 0,
};

const defaultVideoMeta = {
  supports_init_image: true,
  t2v_model_id: "owner/model",
  i2v_model_id: null,
  default_width: 832,
  default_height: 480,
  default_duration_sec: 3.5,
  default_fps: 16,
  default_steps: 6,
  default_guidance_scale: 1,
  concurrent_limit: 1,
};

const defaultAudioMeta = {
  model_id: "owner/model",
  default_speed: 1,
  concurrent_limit: 1,
  supports_input_audio: false,
};

const safeString = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value : fallback;

const safeNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const safeBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const stringifyJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2);
const normalizeVendor = (vendor: string) => vendor.trim().toUpperCase();
const isHuggingFaceVendorValue = (vendor: string) =>
  normalizeVendor(vendor) === DEFAULT_VENDOR;
const pipelineOptions = ["diffusion", "sd", "sdxl"] as const;
type PipelineOption = (typeof pipelineOptions)[number];
const resolvePipeline = (value: unknown): PipelineOption =>
  typeof value === "string" && pipelineOptions.includes(value as PipelineOption)
    ? (value as PipelineOption)
    : "diffusion";

function getDefaultProviderConfig(type: ModelType) {
  if (type === "image") return defaultImageProviderConfig;
  if (type === "video") return defaultVideoProviderConfig;
  return defaultAudioProviderConfig;
}

function getDefaultParameters(type: ModelType) {
  if (type === "image") return defaultImageParameters;
  if (type === "video") return defaultVideoParameters;
  return defaultAudioParameters;
}

function getDefaultMeta(type: ModelType) {
  if (type === "image") return defaultImageMeta;
  if (type === "video") return defaultVideoMeta;
  return defaultAudioMeta;
}

function buildDraft(type: ModelType): ModelDraft {
  return {
    type,
    key: "",
    label: "",
    vendor: DEFAULT_VENDOR,
    provider: DEFAULT_PROVIDER,
    isActive: true,
    isDefault: false,
    providerConfigText: stringifyJson(getDefaultProviderConfig(type)),
    parametersText: stringifyJson(getDefaultParameters(type)),
    metaText: stringifyJson(getDefaultMeta(type)),
  };
}

function buildDraftFromRecord(record: AdminModelRecord): ModelDraft {
  return {
    type: record.type,
    key: record.key,
    label: record.label,
    vendor: record.vendor,
    provider: record.provider,
    isActive: record.isActive,
    isDefault: record.isDefault,
    providerConfigText: stringifyJson(record.providerConfig),
    parametersText: stringifyJson(record.parameters),
    metaText: stringifyJson(record.meta),
  };
}

function toCatalogItem(record: AdminModelRecord): ModelCatalogItem {
  const base = {
    type: record.type,
    key: record.key,
    label: record.label,
    vendor: record.vendor,
    provider: record.provider,
    isActive: record.isActive,
    isDefault: record.isDefault,
  };
  const meta = record.meta ?? {};

  if (record.type === "image") {
    return {
      ...base,
      type: "image",
      meta: {
        pipeline: resolvePipeline(meta.pipeline),
        modelId: safeString(meta.model_id, record.key),
        defaultWidth: safeNumber(meta.default_width, 1024),
        defaultHeight: safeNumber(meta.default_height, 1024),
        defaultSteps: safeNumber(meta.default_steps, 10),
        maxInputImages: safeNumber(meta.max_input_images, 0),
      },
    };
  }

  if (record.type === "video") {
    return {
      ...base,
      type: "video",
      meta: {
        supportsInitImage: safeBoolean(meta.supports_init_image, false),
        t2vModelId: safeString(meta.t2v_model_id, record.key),
        i2vModelId:
          typeof meta.i2v_model_id === "string" ? meta.i2v_model_id : null,
        defaultWidth: safeNumber(meta.default_width, 832),
        defaultHeight: safeNumber(meta.default_height, 480),
        defaultDurationSec: safeNumber(meta.default_duration_sec, 3),
        defaultFps: safeNumber(meta.default_fps, 16),
        defaultSteps: safeNumber(meta.default_steps, 6),
        defaultGuidanceScale: safeNumber(meta.default_guidance_scale, 1),
      },
    };
  }

  return {
    ...base,
    type: "audio",
    meta: {
      modelId: safeString(meta.model_id, record.key),
      defaultSpeed: safeNumber(meta.default_speed, 1),
      supportsInputAudio: safeBoolean(meta.supports_input_audio, false),
    },
  };
}

export function ModelManagementScreen() {
  const tModel = useTranslations("model");
  const tAdmin = useTranslations("model.admin");
  const tCommonLabels = useTranslations("common.labels");
  const [type, setType] = useState<ModelCatalogFilterType>("all");
  const [searchInput, setSearchInput] = useState("");
  const [records, setRecords] = useState<AdminModelRecord[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [draft, setDraft] = useState<ModelDraft>(() => buildDraft("image"));
  const [jsonErrors, setJsonErrors] = useState<JsonErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importApiName, setImportApiName] = useState("");
  const [importOptions, setImportOptions] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const debouncedQuery = useDebouncedValue(searchInput, 300);
  const query = debouncedQuery.trim();

  const recordMap = useMemo(
    () => new Map(records.map((record) => [record.key, record])),
    [records],
  );

  const displayItems = useMemo(
    () => records.map((record) => toCatalogItem(record)),
    [records],
  );

  const filteredModels = useMemo(
    () => filterModelCatalog(displayItems, { type, query }),
    [displayItems, query, type],
  );

  const loadModels = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const response = await fetch(
        "/api/admin/models?includeInactive=true",
        { cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error("LOAD_FAILED");
      }
      const data = (await response.json()) as { items?: AdminModelRecord[] };
      setRecords(Array.isArray(data.items) ? data.items : []);
      setLoadState("ready");
    } catch (error) {
      console.error("[model-management] load failed", error);
      setLoadError(tAdmin("errors.load"));
      setLoadState("error");
    }
  }, [tAdmin]);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const resetDialogState = useCallback(() => {
    setJsonErrors({});
    setSaveError(null);
    setIsSaving(false);
    setDeleteError(null);
    setIsDeleting(false);
    setDeleteDialogOpen(false);
    setImportError(null);
    setImportWarnings([]);
    setIsImporting(false);
  }, []);

  const openCreateDialog = () => {
    resetDialogState();
    setDialogMode("create");
    setDraft(buildDraft("image"));
    setImportUrl("");
    setImportApiName("");
    setImportOptions([]);
    setDialogOpen(true);
  };

  const openEditDialog = (key: string) => {
    const record = recordMap.get(key);
    if (!record) return;
    resetDialogState();
    setDialogMode("edit");
    setDraft(buildDraftFromRecord(record));
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    resetDialogState();
  };

  const updateDraft = (partial: Partial<ModelDraft>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
  };

  const isHuggingFaceVendor = isHuggingFaceVendorValue(draft.vendor);

  const handleVendorSelect = (vendor: VendorOption) => {
    if (dialogMode === "edit") return;
    const option = vendorOptions.find((item) => item.value === vendor);
    if (!option || option.disabled) return;
    updateDraft({ vendor: DEFAULT_VENDOR, provider: DEFAULT_PROVIDER });
    setImportError(null);
    setImportWarnings([]);
  };

  const applyImportDraft = (payload: {
    type: ModelType;
    key: string;
    label: string;
    vendor: string;
    provider: string;
    isActive: boolean;
    isDefault: boolean;
    providerConfig: Record<string, unknown>;
    parameters: Record<string, unknown>;
    meta: Record<string, unknown>;
  }) => {
    const vendorIsHuggingFace = isHuggingFaceVendorValue(payload.vendor);
    setDraft({
      type: payload.type,
      key: payload.key,
      label: payload.label,
      vendor: vendorIsHuggingFace ? DEFAULT_VENDOR : payload.vendor,
      provider: vendorIsHuggingFace ? DEFAULT_PROVIDER : payload.provider,
      isActive: payload.isActive,
      isDefault: payload.isDefault,
      providerConfigText: stringifyJson(payload.providerConfig),
      parametersText: stringifyJson(payload.parameters),
      metaText: stringifyJson(payload.meta),
    });
    setJsonErrors({});
    setSaveError(null);
  };

  const updateType = (nextType: ModelType) => {
    setDraft((prev) => {
      if (prev.type === nextType) return prev;
      const defaults = buildDraft(nextType);
      return {
        ...defaults,
        key: prev.key,
        label: prev.label,
        vendor: prev.vendor,
        provider: prev.provider,
        isActive: prev.isActive,
        isDefault: prev.isDefault,
      };
    });
  };

  const parseJson = (value: string, field: keyof JsonErrors) => {
    try {
      const parsed = JSON.parse(value);
      return { parsed, error: null } as const;
    } catch {
      return { parsed: null, error: tAdmin("errors.json") } as const;
    }
  };

  const handleSave = async () => {
    if (!draft.key.trim() || !draft.label.trim()) {
      setSaveError(tAdmin("errors.required"));
      return;
    }

    setDeleteError(null);
    const providerConfigResult = parseJson(
      draft.providerConfigText,
      "providerConfig",
    );
    const parametersResult = parseJson(draft.parametersText, "parameters");
    const metaResult = parseJson(draft.metaText, "meta");

    const nextJsonErrors: JsonErrors = {
      providerConfig: providerConfigResult.error ?? undefined,
      parameters: parametersResult.error ?? undefined,
      meta: metaResult.error ?? undefined,
    };

    setJsonErrors(nextJsonErrors);

    if (
      nextJsonErrors.providerConfig ||
      nextJsonErrors.parameters ||
      nextJsonErrors.meta
    ) {
      setSaveError(tAdmin("errors.json"));
      return;
    }

    setSaveError(null);
    setIsSaving(true);

    const payload = {
      type: draft.type,
      key: draft.key.trim(),
      label: draft.label.trim(),
      vendor: draft.vendor.trim(),
      provider: draft.provider.trim(),
      providerConfig: providerConfigResult.parsed,
      parameters: parametersResult.parsed,
      meta: metaResult.parsed,
      isActive: draft.isActive,
      isDefault: draft.isDefault,
    };

    try {
      const response = await fetch(
        dialogMode === "create"
          ? "/api/admin/models"
          : `/api/admin/models/${encodeURIComponent(draft.key)}`,
        {
          method: dialogMode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            dialogMode === "create"
              ? payload
              : {
                  label: payload.label,
                  vendor: payload.vendor,
                  provider: payload.provider,
                  providerConfig: payload.providerConfig,
                  parameters: payload.parameters,
                  meta: payload.meta,
                  isActive: payload.isActive,
                  isDefault: payload.isDefault,
                },
          ),
        },
      );

      if (!response.ok) {
        if (response.status === 409) {
          setSaveError(tAdmin("errors.conflict"));
          return;
        }
        if (response.status === 400) {
          setSaveError(tAdmin("errors.json"));
          return;
        }
        throw new Error("SAVE_FAILED");
      }

      await loadModels();
      setDialogOpen(false);
    } catch (error) {
      console.error("[model-management] save failed", error);
      setSaveError(tAdmin("errors.save"));
    } finally {
      setIsSaving(false);
    }
  };

  const performDelete = async () => {
    if (dialogMode !== "edit" || isDeleting) return;

    setIsDeleting(true);

    const deletePromise = (async () => {
      const response = await fetch(
        `/api/admin/models/${encodeURIComponent(draft.key)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(tAdmin("errors.notFound"));
        }
        throw new Error(tAdmin("errors.delete"));
      }

      await loadModels();
      setDialogOpen(false);
      return draft.key;
    })();

    toast.promise(deletePromise, {
      loading: tAdmin("dialog.deleting"),
      success: tAdmin("dialog.deleteSuccess"),
      error: (error) =>
        error instanceof Error ? error.message : tAdmin("errors.delete"),
    });

    try {
      await deletePromise;
    } catch (error) {
      console.error("[model-management] delete failed", error);
      setDeleteError(
        error instanceof Error ? error.message : tAdmin("errors.delete"),
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDelete = () => {
    if (dialogMode !== "edit" || isDeleting) return;

    setSaveError(null);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };

  const handleImport = async () => {
    if (!importUrl.trim()) {
      setImportError(tAdmin("import.errors.required"));
      return;
    }

    setIsImporting(true);
    setImportError(null);
    setImportWarnings([]);

    try {
      const response = await fetch("/api/admin/models/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spaceUrl: importUrl.trim(),
          apiName: importApiName.trim() ? importApiName.trim() : undefined,
        }),
      });

      const data = (await response.json()) as {
        draft?: {
          type: ModelType;
          key: string;
          label: string;
          vendor: string;
          provider: string;
          isActive: boolean;
          isDefault: boolean;
          providerConfig: Record<string, unknown>;
          parameters: Record<string, unknown>;
          meta: Record<string, unknown>;
        };
        apiNames?: string[];
        resolvedApiName?: string;
        warnings?: string[];
        message?: string;
      };

      if (!response.ok || !data.draft) {
        setImportError(tAdmin("import.errors.failed"));
        return;
      }

      applyImportDraft(data.draft);
      setImportOptions(Array.isArray(data.apiNames) ? data.apiNames : []);
      if (data.resolvedApiName) {
        setImportApiName(data.resolvedApiName);
      }
      setImportWarnings(Array.isArray(data.warnings) ? data.warnings : []);
    } catch (error) {
      console.error("[model-management] import failed", error);
      setImportError(tAdmin("import.errors.failed"));
    } finally {
      setIsImporting(false);
    }
  };

  const content = (() => {
    if (loadState === "loading") {
      return (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border border-white/5 bg-surface-dark px-6 text-center shadow-lg">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs font-mono uppercase tracking-widest text-gray-500">
            {tAdmin("status.loading")}
          </p>
        </div>
      );
    }

    if (loadState === "error") {
      return (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border border-white/5 bg-surface-dark px-6 text-center shadow-lg">
          <p className="text-xs font-mono uppercase tracking-widest text-red-300">
            {loadError ?? tAdmin("errors.load")}
          </p>
        </div>
      );
    }

    return (
      <ModelList
        items={filteredModels}
        onEdit={openEditDialog}
        emptyMessage={query ? tModel("empty.search") : tModel("empty.default")}
      />
    );
  })();

  return (
    <div className="flex flex-col gap-8 pb-20 overflow-x-hidden">
      <PageHeader
        title={
          <>
            <span className="text-white">{tModel("title.leading")}</span>{" "}
            <span className="text-primary">{tModel("title.accent")}</span>
          </>
        }
        subtitle={tModel("subtitle")}
        rightSlot={
          <PageHeaderSearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder={tCommonLabels("searchPlaceholder")}
            filterButtonLabel={tCommonLabels("filterOptions")}
          />
        }
      >
        <DashboardFilterBar>
          <DashboardFilterToggle
            onClick={() => setType("all")}
            aria-pressed={type === "all"}
            active={type === "all"}
            icon={<Grid2X2 className="h-4 w-4" />}
          >
            {tCommonLabels("all")}
          </DashboardFilterToggle>
          <DashboardFilterToggle
            onClick={() => setType("image")}
            aria-pressed={type === "image"}
            active={type === "image"}
            icon={<ImageIcon className="h-4 w-4" />}
          >
            {tCommonLabels("images")}
          </DashboardFilterToggle>
          <DashboardFilterToggle
            onClick={() => setType("video")}
            aria-pressed={type === "video"}
            active={type === "video"}
            icon={<Video className="h-4 w-4" />}
          >
            {tCommonLabels("videos")}
          </DashboardFilterToggle>
          <DashboardFilterToggle
            onClick={() => setType("audio")}
            aria-pressed={type === "audio"}
            active={type === "audio"}
            icon={<AudioLines className="h-4 w-4" />}
          >
            {tCommonLabels("audios")}
          </DashboardFilterToggle>
          <DashboardFilterDivider />
          <span className="text-xs font-mono uppercase tracking-widest text-gray-500">
            {tCommonLabels("total", { total: filteredModels.length })}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <AppButton
              type="button"
              variant="surface"
              size="sm"
              isLoading={loadState === "loading"}
              loadingText={tAdmin("toolbar.reloading")}
              onClick={loadModels}
            >
              <RefreshCw className="h-4 w-4" />
              {tAdmin("toolbar.reload")}
            </AppButton>
            <DashboardCtaButton
              type="button"
              onClick={openCreateDialog}
            >
              <Plus className="h-4 w-4" />
              {tAdmin("toolbar.create")}
            </DashboardCtaButton>
          </div>
        </DashboardFilterBar>
      </PageHeader>

      <div className="mx-auto w-full max-w-[1600px]">{content}</div>

      <Dialog open={dialogOpen} onOpenChange={(open) => (!open ? closeDialog() : undefined)}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-3xl rounded-2xl border-white/10 bg-surface-dark p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogDescription className="text-xs font-mono uppercase tracking-widest text-gray-500">
                {dialogMode === "create"
                  ? tAdmin("dialog.createTitle")
                  : tAdmin("dialog.editTitle")}
              </DialogDescription>
              <DialogTitle className="mt-2 text-xl font-bold text-white">
                {draft.label || draft.key || tAdmin("dialog.untitled")}
              </DialogTitle>
              <p className="mt-1 text-xs font-mono text-gray-500">
                {draft.key ? `#${draft.key}` : tAdmin("dialog.helper")}
              </p>
            </div>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                className="rounded-lg border border-white/10 p-2 text-gray-400 transition-colors hover:border-white/30 hover:text-white"
                aria-label={tAdmin("dialog.close")}
              >
                ✕
              </Button>
            </DialogClose>
          </div>

          <div className="mt-6 space-y-6">
            {dialogMode === "create" ? (
              <div className="rounded-2xl border border-white/10 bg-background-dark/60 p-4">
                <div className="text-xs font-mono uppercase tracking-widest text-gray-500">
                  {tAdmin("vendor.title")}
                </div>
                <DashboardFilterBar className="mt-3 gap-2">
                  {vendorOptions.map((option) => {
                    const labelKey =
                      option.value === "HUGGINGFACE"
                        ? "vendor.huggingface"
                        : "vendor.api";
                    const isActive = isHuggingFaceVendor && option.value === "HUGGINGFACE";
                    return (
                      <DashboardFilterToggle
                        key={option.value}
                        onClick={() => handleVendorSelect(option.value)}
                        aria-pressed={isActive}
                        active={isActive}
                        disabled={option.disabled}
                        className="disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {tAdmin(labelKey)}
                      </DashboardFilterToggle>
                    );
                  })}
                </DashboardFilterBar>
                <p className="mt-2 text-xs text-gray-500">
                  {tAdmin("vendor.description")}
                </p>

                {isHuggingFaceVendor ? (
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <div className="text-xs font-mono uppercase tracking-widest text-gray-500">
                      {tAdmin("import.title")}
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      {tAdmin("import.description")}
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-xs font-mono uppercase tracking-widest text-gray-500">
                          {tAdmin("import.spaceUrl")}
                        </Label>
                        <Input
                          value={importUrl}
                          onChange={(event) => setImportUrl(event.target.value)}
                          placeholder="https://huggingface.co/spaces/owner/space"
                          className="h-11 w-full rounded-xl border-white/10 bg-black/40 px-4 text-sm text-white focus-visible:border-primary"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-mono uppercase tracking-widest text-gray-500">
                          {tAdmin("import.apiName")}
                        </Label>
                        <Input
                          value={importApiName}
                          onChange={(event) => setImportApiName(event.target.value)}
                          placeholder="/predict"
                          className="h-11 w-full rounded-xl border-white/10 bg-black/40 px-4 text-sm text-white focus-visible:border-primary"
                          list="model-import-api-names"
                        />
                        {importOptions.length > 0 ? (
                          <datalist id="model-import-api-names">
                            {importOptions.map((option) => (
                              <option key={option} value={option} />
                            ))}
                          </datalist>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <AppButton
                        type="button"
                        variant="surface"
                        size="sm"
                        isLoading={isImporting}
                        loadingText={tAdmin("import.loading")}
                        onClick={handleImport}
                      >
                        {tAdmin("import.action")}
                      </AppButton>
                      {importError ? (
                        <span className="text-xs text-red-300">{importError}</span>
                      ) : null}
                    </div>
                    {importWarnings.length > 0 ? (
                      <p className="mt-3 text-xs text-amber-200">
                        {tAdmin("import.warnings", { count: importWarnings.length })}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-gray-500">{tAdmin("vendor.apiDisabled")}</p>
                )}
              </div>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label
                  htmlFor="model-type"
                  className="text-xs font-mono uppercase tracking-widest text-gray-500"
                >
                  {tAdmin("fields.type")}
                </Label>
                <select
                  id="model-type"
                  value={draft.type}
                  onChange={(event) => updateType(event.target.value as ModelType)}
                  disabled={dialogMode === "edit"}
                  className="h-11 w-full rounded-xl border border-white/10 bg-surface-lighter px-3 text-sm text-white focus:border-primary focus:outline-none"
                >
                  <option value="image">{tCommonLabels("images")}</option>
                  <option value="video">{tCommonLabels("videos")}</option>
                  <option value="audio">{tCommonLabels("audios")}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono uppercase tracking-widest text-gray-500">
                  {tAdmin("fields.key")}
                </Label>
                <Input
                  value={draft.key}
                  disabled={dialogMode === "edit"}
                  onChange={(event) => updateDraft({ key: event.target.value })}
                  className="h-11 w-full rounded-xl border-white/10 bg-black/40 px-4 text-sm text-white focus-visible:border-primary"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono uppercase tracking-widest text-gray-500">
                  {tAdmin("fields.label")}
                </Label>
                <Input
                  value={draft.label}
                  onChange={(event) => updateDraft({ label: event.target.value })}
                  className="h-11 w-full rounded-xl border-white/10 bg-black/40 px-4 text-sm text-white focus-visible:border-primary"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono uppercase tracking-widest text-gray-500">
                  {tAdmin("fields.vendor")}
                </Label>
                <Input
                  value={draft.vendor}
                  disabled
                  className="h-11 w-full rounded-xl border-white/10 bg-black/40 px-4 text-sm text-white focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-mono uppercase tracking-widest text-gray-500">
                  {tAdmin("fields.provider")}
                </Label>
                <Input
                  value={draft.provider}
                  disabled
                  className="h-11 w-full rounded-xl border-white/10 bg-black/40 px-4 text-sm text-white focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-gray-400">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(event) =>
                    updateDraft({ isActive: event.target.checked })
                  }
                  className="h-4 w-4 accent-primary"
                />
                {tAdmin("fields.isActive")}
              </label>
              <label className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-gray-400">
                <input
                  type="checkbox"
                  checked={draft.isDefault}
                  onChange={(event) =>
                    updateDraft({ isDefault: event.target.checked })
                  }
                  className="h-4 w-4 accent-primary"
                />
                {tAdmin("fields.isDefault")}
              </label>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-mono uppercase tracking-widest text-gray-500">
                {tAdmin("fields.providerConfig")}
              </Label>
              <Textarea
                value={draft.providerConfigText}
                onChange={(event) =>
                  updateDraft({ providerConfigText: event.target.value })
                }
                className="min-h-[140px] w-full rounded-xl border-white/10 bg-black/40 px-4 py-3 font-mono text-xs text-white focus-visible:border-primary"
              />
              {jsonErrors.providerConfig ? (
                <p className="text-xs text-red-300">
                  {jsonErrors.providerConfig}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-mono uppercase tracking-widest text-gray-500">
                {tAdmin("fields.parameters")}
              </Label>
              <Textarea
                value={draft.parametersText}
                onChange={(event) =>
                  updateDraft({ parametersText: event.target.value })
                }
                className="min-h-[180px] w-full rounded-xl border-white/10 bg-black/40 px-4 py-3 font-mono text-xs text-white focus-visible:border-primary"
              />
              {jsonErrors.parameters ? (
                <p className="text-xs text-red-300">
                  {jsonErrors.parameters}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-mono uppercase tracking-widest text-gray-500">
                {tAdmin("fields.meta")}
              </Label>
              <Textarea
                value={draft.metaText}
                onChange={(event) =>
                  updateDraft({ metaText: event.target.value })
                }
                className="min-h-[160px] w-full rounded-xl border-white/10 bg-black/40 px-4 py-3 font-mono text-xs text-white focus-visible:border-primary"
              />
              {jsonErrors.meta ? (
                <p className="text-xs text-red-300">{jsonErrors.meta}</p>
              ) : null}
            </div>
            {deleteError || saveError ? (
              <p className="text-xs text-red-300">{deleteError ?? saveError}</p>
            ) : null}
          </div>

          <DialogFooter className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            {dialogMode === "edit" ? (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                isLoading={isDeleting}
                loadingText={tAdmin("dialog.deleting")}
                className="rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wider sm:mr-auto"
              >
                {tAdmin("dialog.delete")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="rounded-full border border-white/10 px-5 py-2 text-xs font-bold uppercase tracking-wider text-gray-300 transition-colors hover:bg-white/10"
              onClick={closeDialog}
            >
              {tAdmin("dialog.cancel")}
            </Button>
            <DashboardCtaButton
              type="button"
              onClick={handleSave}
              isLoading={isSaving}
              loadingText={tAdmin("dialog.saving")}
              size="sm"
              className="px-5 text-xs"
            >
              {tAdmin("dialog.save")}
            </DashboardCtaButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!isDeleting) setDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-white">
              {tAdmin("dialog.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-gray-300">
              {tAdmin("dialog.deleteConfirm", { key: draft.key })}
            </AlertDialogDescription>
            <p className="text-xs font-mono uppercase tracking-widest text-gray-500">
              {tAdmin("dialog.deleteDescription")}
            </p>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel className="rounded-full border border-white/10 px-5 py-2 text-xs font-bold uppercase tracking-wider text-gray-300 transition-colors hover:bg-white/10">
              {tAdmin("dialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={() => {
                setDeleteDialogOpen(false);
                void performDelete();
              }}
              className="rounded-full bg-destructive px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-destructive/90"
            >
              {tAdmin("dialog.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
