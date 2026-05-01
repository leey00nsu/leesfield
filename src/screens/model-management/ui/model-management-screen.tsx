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
  X,
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
import {
  AppConfirmDialog,
  AppConfirmDialogAction,
  AppConfirmDialogCancel,
  AppConfirmDialogContent,
  AppConfirmDialogDescription,
  AppConfirmDialogFooter,
  AppConfirmDialogHeader,
  AppConfirmDialogTitle,
} from "@/shared/ui/app-confirm-dialog";
import {
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from "@/shared/ui/app-dialog";
import {
  AppCheckbox,
  AppFormField,
  AppInput,
  AppLabel,
  AppSelectNative,
  AppTextarea,
} from "@/shared/ui/app-form-control";
import { useDebouncedValue } from "@/shared/lib/hooks/use-debounced-value";
import {
  AppFilterGroup,
  AppFilterToolbar,
  AppFilterToggle,
  AppSearchField,
  AppSortSelect,
} from "@/shared/ui/app-filter-toolbar";
import { AppCard } from "@/shared/ui/app-card";

const DEFAULT_VENDOR = "HUGGINGFACE";
const DEFAULT_PROVIDER = "hf_space";

type ModelType = "image" | "video" | "audio";
type VendorOption = "HUGGINGFACE" | "API";
type ModelSortOption = "latest" | "name" | "type";

const vendorOptions: Array<{ value: VendorOption; disabled?: boolean }> = [
  { value: "HUGGINGFACE" },
  { value: "API", disabled: true },
];

const modelSortOptions: ModelSortOption[] = ["latest", "name", "type"];

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
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
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

function getModelTimestamp(item: ModelCatalogItem) {
  const time = new Date(item.updatedAt ?? item.createdAt ?? "").getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sortModelCatalogItems(
  items: ModelCatalogItem[],
  sort: ModelSortOption,
) {
  return [...items].sort((a, b) => {
    if (sort === "latest") {
      return getModelTimestamp(b) - getModelTimestamp(a);
    }

    if (sort === "type") {
      return (
        a.type.localeCompare(b.type) ||
        a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
      );
    }

    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
}

export function ModelManagementScreen() {
  const tModel = useTranslations("model");
  const tAdmin = useTranslations("model.admin");
  const tCommonLabels = useTranslations("common.labels");
  const [type, setType] = useState<ModelCatalogFilterType>("all");
  const [searchInput, setSearchInput] = useState("");
  const [sort, setSort] = useState<ModelSortOption>("latest");
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
    () => sortModelCatalogItems(filterModelCatalog(displayItems, { type, query }), sort),
    [displayItems, query, sort, type],
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

  const parseJson = (value: string) => {
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
    const providerConfigResult = parseJson(draft.providerConfigText);
    const parametersResult = parseJson(draft.parametersText);
    const metaResult = parseJson(draft.metaText);

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
        <AppCard
          variant="editorial-flat"
          className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-[1.1rem] px-6 text-center"
        >
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs font-mono uppercase tracking-widest text-gray-500">
            {tAdmin("status.loading")}
          </p>
        </AppCard>
      );
    }

    if (loadState === "error") {
      return (
        <AppCard
          variant="editorial-flat"
          className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-[1.1rem] px-6 text-center"
        >
          <p className="text-xs font-mono uppercase tracking-widest text-red-300">
            {loadError ?? tAdmin("errors.load")}
          </p>
        </AppCard>
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
    <div className="overflow-x-hidden pb-20 pt-4 sm:pt-6">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-4 px-4 sm:px-6 lg:px-8">
        <AppFilterToolbar>
          <AppFilterGroup>
            <AppFilterToggle
              onClick={() => setType("all")}
              aria-pressed={type === "all"}
              active={type === "all"}
              icon={<Grid2X2 className="h-4 w-4" />}
            >
              {tCommonLabels("all")}
            </AppFilterToggle>
            <AppFilterToggle
              onClick={() => setType("image")}
              aria-pressed={type === "image"}
              active={type === "image"}
              icon={<ImageIcon className="h-4 w-4" />}
            >
              {tCommonLabels("images")}
            </AppFilterToggle>
            <AppFilterToggle
              onClick={() => setType("video")}
              aria-pressed={type === "video"}
              active={type === "video"}
              icon={<Video className="h-4 w-4" />}
            >
              {tCommonLabels("videos")}
            </AppFilterToggle>
            <AppFilterToggle
              onClick={() => setType("audio")}
              aria-pressed={type === "audio"}
              active={type === "audio"}
              icon={<AudioLines className="h-4 w-4" />}
            >
              {tCommonLabels("audios")}
            </AppFilterToggle>
          </AppFilterGroup>

          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap lg:max-w-none lg:flex-[1_1_34rem]">
            <AppSearchField
              aria-label={tCommonLabels("searchPlaceholder")}
              containerClassName="sm:min-w-[18rem] sm:flex-[1_1_18rem]"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={tCommonLabels("searchPlaceholder")}
            />
            <AppSortSelect
              value={sort}
              onValueChange={(value) => setSort(value as ModelSortOption)}
              ariaLabel={tModel("sort.label")}
              className="w-full sm:w-[12rem]"
              options={modelSortOptions.map((option) => ({
                value: option,
                label: tModel(`sort.${option}`),
              }))}
            />
            <AppButton
              type="button"
              variant="surface"
              size="md"
              isLoading={loadState === "loading"}
              loadingText={tAdmin("toolbar.reloading")}
              onClick={loadModels}
              className="shrink-0 rounded-xl"
            >
              <RefreshCw className="h-4 w-4" />
              {tAdmin("toolbar.reload")}
            </AppButton>
            <AppButton
              type="button"
              size="md"
              onClick={openCreateDialog}
              className="shrink-0 rounded-xl"
            >
              <Plus className="h-4 w-4" />
              {tAdmin("toolbar.create")}
            </AppButton>
          </div>
        </AppFilterToolbar>

        {content}
      </div>

      <AppDialog open={dialogOpen} onOpenChange={(open) => (!open ? closeDialog() : undefined)}>
        <AppDialogContent>
          <AppDialogHeader>
            <div>
              <AppDialogDescription>
                {dialogMode === "create"
                  ? tAdmin("dialog.createTitle")
                  : tAdmin("dialog.editTitle")}
              </AppDialogDescription>
              <AppDialogTitle>
                {draft.label || draft.key || tAdmin("dialog.untitled")}
              </AppDialogTitle>
              <p className="mt-1 text-xs font-mono text-gray-500">
                {draft.key ? `#${draft.key}` : tAdmin("dialog.helper")}
              </p>
            </div>
            <AppDialogClose asChild>
              <AppButton
                type="button"
                variant="surface"
                size="icon-sm"
                aria-label={tAdmin("dialog.close")}
              >
                <X className="h-4 w-4" />
              </AppButton>
            </AppDialogClose>
          </AppDialogHeader>

          <div className="mt-6 space-y-6">
            {dialogMode === "create" ? (
              <div className="rounded-2xl border border-white/10 bg-background-dark/60 p-4">
                <div className="text-xs font-mono uppercase tracking-widest text-gray-500">
                  {tAdmin("vendor.title")}
                </div>
                <AppFilterGroup className="mt-3 gap-2">
                  {vendorOptions.map((option) => {
                    const labelKey =
                      option.value === "HUGGINGFACE"
                        ? "vendor.huggingface"
                        : "vendor.api";
                    const isActive = isHuggingFaceVendor && option.value === "HUGGINGFACE";
                    return (
                      <AppFilterToggle
                        key={option.value}
                        onClick={() => handleVendorSelect(option.value)}
                        aria-pressed={isActive}
                        active={isActive}
                        disabled={option.disabled}
                        className="disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {tAdmin(labelKey)}
                      </AppFilterToggle>
                    );
                  })}
                </AppFilterGroup>
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
                      <AppFormField>
                        <AppLabel>
                          {tAdmin("import.spaceUrl")}
                        </AppLabel>
                        <AppInput
                          value={importUrl}
                          onChange={(event) => setImportUrl(event.target.value)}
                          placeholder="https://huggingface.co/spaces/owner/space"
                        />
                      </AppFormField>
                      <AppFormField>
                        <AppLabel>
                          {tAdmin("import.apiName")}
                        </AppLabel>
                        <AppInput
                          value={importApiName}
                          onChange={(event) => setImportApiName(event.target.value)}
                          placeholder="/predict"
                          list="model-import-api-names"
                        />
                        {importOptions.length > 0 ? (
                          <datalist id="model-import-api-names">
                            {importOptions.map((option) => (
                              <option key={option} value={option} />
                            ))}
                          </datalist>
                        ) : null}
                      </AppFormField>
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
              <AppFormField>
                <AppLabel
                  htmlFor="model-type"
                >
                  {tAdmin("fields.type")}
                </AppLabel>
                <AppSelectNative
                  id="model-type"
                  value={draft.type}
                  onChange={(event) => updateType(event.target.value as ModelType)}
                  disabled={dialogMode === "edit"}
                >
                  <option value="image">{tCommonLabels("images")}</option>
                  <option value="video">{tCommonLabels("videos")}</option>
                  <option value="audio">{tCommonLabels("audios")}</option>
                </AppSelectNative>
              </AppFormField>
              <AppFormField>
                <AppLabel>
                  {tAdmin("fields.key")}
                </AppLabel>
                <AppInput
                  value={draft.key}
                  disabled={dialogMode === "edit"}
                  onChange={(event) => updateDraft({ key: event.target.value })}
                />
              </AppFormField>
              <AppFormField>
                <AppLabel>
                  {tAdmin("fields.label")}
                </AppLabel>
                <AppInput
                  value={draft.label}
                  onChange={(event) => updateDraft({ label: event.target.value })}
                />
              </AppFormField>
              <AppFormField>
                <AppLabel>
                  {tAdmin("fields.vendor")}
                </AppLabel>
                <AppInput
                  value={draft.vendor}
                  disabled
                />
              </AppFormField>
              <AppFormField>
                <AppLabel>
                  {tAdmin("fields.provider")}
                </AppLabel>
                <AppInput
                  value={draft.provider}
                  disabled
                />
              </AppFormField>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <AppCheckbox
                label={tAdmin("fields.isActive")}
                checked={draft.isActive}
                onChange={(event) =>
                  updateDraft({ isActive: event.target.checked })
                }
              />
              <AppCheckbox
                label={tAdmin("fields.isDefault")}
                checked={draft.isDefault}
                onChange={(event) =>
                  updateDraft({ isDefault: event.target.checked })
                }
              />
            </div>

            <AppFormField>
              <AppLabel>
                {tAdmin("fields.providerConfig")}
              </AppLabel>
              <AppTextarea
                value={draft.providerConfigText}
                onChange={(event) =>
                  updateDraft({ providerConfigText: event.target.value })
                }
                className="min-h-[140px]"
              />
              {jsonErrors.providerConfig ? (
                <p className="text-xs text-red-300">
                  {jsonErrors.providerConfig}
                </p>
              ) : null}
            </AppFormField>

            <AppFormField>
              <AppLabel>
                {tAdmin("fields.parameters")}
              </AppLabel>
              <AppTextarea
                value={draft.parametersText}
                onChange={(event) =>
                  updateDraft({ parametersText: event.target.value })
                }
                className="min-h-[180px]"
              />
              {jsonErrors.parameters ? (
                <p className="text-xs text-red-300">
                  {jsonErrors.parameters}
                </p>
              ) : null}
            </AppFormField>

            <AppFormField>
              <AppLabel>
                {tAdmin("fields.meta")}
              </AppLabel>
              <AppTextarea
                value={draft.metaText}
                onChange={(event) =>
                  updateDraft({ metaText: event.target.value })
                }
                className="min-h-[160px]"
              />
              {jsonErrors.meta ? (
                <p className="text-xs text-red-300">{jsonErrors.meta}</p>
              ) : null}
            </AppFormField>
            {deleteError || saveError ? (
              <p className="text-xs text-red-300">{deleteError ?? saveError}</p>
            ) : null}
          </div>

          <AppDialogFooter>
            {dialogMode === "edit" ? (
              <AppButton
                type="button"
                variant="danger"
                size="sm"
                onClick={handleDelete}
                isLoading={isDeleting}
                loadingText={tAdmin("dialog.deleting")}
                className="px-5 text-xs sm:mr-auto"
              >
                {tAdmin("dialog.delete")}
              </AppButton>
            ) : null}
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              className="border border-white/10 px-5 text-xs"
              onClick={closeDialog}
            >
              {tAdmin("dialog.cancel")}
            </AppButton>
            <AppButton
              type="button"
              onClick={handleSave}
              isLoading={isSaving}
              loadingText={tAdmin("dialog.saving")}
              size="sm"
              className="px-5 text-xs"
            >
              {tAdmin("dialog.save")}
            </AppButton>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
      <AppConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!isDeleting) setDeleteDialogOpen(open);
        }}
      >
        <AppConfirmDialogContent>
          <AppConfirmDialogHeader>
            <AppConfirmDialogTitle>
              {tAdmin("dialog.deleteTitle")}
            </AppConfirmDialogTitle>
            <AppConfirmDialogDescription>
              {tAdmin("dialog.deleteConfirm", { key: draft.key })}
            </AppConfirmDialogDescription>
            <p className="text-xs font-mono uppercase tracking-widest text-gray-500">
              {tAdmin("dialog.deleteDescription")}
            </p>
          </AppConfirmDialogHeader>
          <AppConfirmDialogFooter>
            <AppConfirmDialogCancel>
              {tAdmin("dialog.cancel")}
            </AppConfirmDialogCancel>
            <AppConfirmDialogAction
              disabled={isDeleting}
              onClick={() => {
                setDeleteDialogOpen(false);
                void performDelete();
              }}
            >
              {tAdmin("dialog.delete")}
            </AppConfirmDialogAction>
          </AppConfirmDialogFooter>
        </AppConfirmDialogContent>
      </AppConfirmDialog>
    </div>
  );
}
