import type { ModelCatalogItem } from "@/server/model-catalog/catalog-schema";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import { parseMonitoringQuery } from "@/server/monitoring/monitoring-query";
import { getMonitoringOverview } from "@/server/monitoring/overview";
import { getMonitoringStats } from "@/server/monitoring/stats";
import { getMonitoringTop } from "@/server/monitoring/top";
import { modelCatalog as fallbackModelCatalog } from "@/features/model-management/model/model-catalog";
import {
  LandingPlatformClientSection,
  type LandingPlatformModel,
  type LandingPlatformMonitoringData,
  type LandingPlatformUsageItem,
} from "@/widgets/landing/ui/landing-platform-section-client";

const MODEL_ASSETS = [
  "/assets/creative-studio/studio-vocalist.jpg",
  "/assets/creative-studio/film-production.jpg",
  "/assets/creative-studio/audio-console.jpg",
  "/assets/creative-studio/mirror-portrait.jpg",
];

const USAGE_COLORS = ["#d4f032", "#f5f2df", "#9e8cff", "#6ee7b7"];

type FallbackCatalogItem = (typeof fallbackModelCatalog)[number];

function toTitleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toLandingModel(
  model: Pick<
    FallbackCatalogItem | ModelCatalogItem,
    "key" | "label" | "vendor" | "provider" | "type"
  >,
  index: number,
): LandingPlatformModel {
  return {
    key: model.key,
    label: model.label,
    vendor: model.vendor,
    provider: model.provider,
    modality: toTitleCase(model.type) as LandingPlatformModel["modality"],
    asset: MODEL_ASSETS[index % MODEL_ASSETS.length],
  };
}

async function loadModelCatalog() {
  try {
    const catalog = await getModelCatalog({
      bypassCache: true,
      includeInactive: false,
    });

    if (catalog.length > 0) {
      return catalog.map(toLandingModel);
    }
  } catch {
    // Landing should still render when the local database is not available.
  }

  return fallbackModelCatalog.map(toLandingModel);
}

function selectFeaturedModels(catalog: LandingPlatformModel[]) {
  const imageModel =
    catalog.find((model) => model.key.includes("gpt-image-2")) ??
    catalog.find((model) => model.modality === "Image");
  const videoModel = catalog.find((model) => model.modality === "Video");
  const audioModel = catalog.find((model) => model.modality === "Audio");
  const fallback = catalog.find(
    (model) => model.key !== imageModel?.key && model.key !== videoModel?.key,
  );

  return [imageModel, videoModel, audioModel, fallback].filter(
    (model): model is LandingPlatformModel => Boolean(model),
  ).slice(0, 3);
}

function formatChartDay(day: string) {
  const [, month, date] = day.split("-");
  return month && date ? `${month}/${date}` : day;
}

function toUsageData(
  models: Awaited<ReturnType<typeof getMonitoringTop>>["models"],
  catalog: LandingPlatformModel[],
): LandingPlatformUsageItem[] {
  const labelByKey = new Map(catalog.map((model) => [model.key, model.label]));
  const total = models.reduce((sum, model) => sum + model.total, 0);

  if (total <= 0) {
    return [];
  }

  return models
    .filter((model) => model.total > 0)
    .slice(0, 4)
    .map((model, index) => ({
      name: labelByKey.get(model.key) ?? model.label,
      value: Math.round((model.total / total) * 100),
      total: model.total,
      color: USAGE_COLORS[index] ?? USAGE_COLORS[USAGE_COLORS.length - 1],
    }));
}

async function loadMonitoringData(
  catalog: LandingPlatformModel[],
): Promise<LandingPlatformMonitoringData> {
  const emptyData = {
    totalCount: 0,
    successRate: null,
    trend: [],
    usage: [],
  };

  try {
    const query = parseMonitoringQuery(new URLSearchParams(), {
      defaultDays: 7,
      defaultLimit: 50,
      defaultMetric: "requests",
    });
    const [overview, stats, top] = await Promise.all([
      getMonitoringOverview(query),
      getMonitoringStats(query),
      getMonitoringTop(query, 4),
    ]);

    return {
      totalCount: overview.totalCount,
      successRate:
        overview.totalCount > 0
          ? Number(((1 - overview.errorRate) * 100).toFixed(1))
          : null,
      trend: stats.map((row) => ({
        day: formatChartDay(row.day),
        requests: row.total,
        errors: row.failed,
      })),
      usage: toUsageData(top.models, catalog),
    };
  } catch {
    return emptyData;
  }
}

export async function LandingPlatformSection() {
  const modelCatalog = await loadModelCatalog();
  const featuredModels = selectFeaturedModels(modelCatalog);
  const monitoring = await loadMonitoringData(modelCatalog);

  return (
    <LandingPlatformClientSection
      featuredModels={featuredModels}
      monitoring={monitoring}
    />
  );
}
