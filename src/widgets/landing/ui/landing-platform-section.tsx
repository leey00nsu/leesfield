import type { ModelCatalogItem } from "@/server/model-catalog/catalog-schema";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import { modelCatalog as fallbackModelCatalog } from "@/features/model-management/model/model-catalog";
import {
  LandingPlatformClientSection,
  type LandingPlatformModel,
  type LandingPlatformMonitoringData,
} from "@/widgets/landing/ui/landing-platform-section-client";

const MODEL_ASSETS = [
  "/assets/creative-studio/studio-vocalist.jpg",
  "/assets/creative-studio/film-production.jpg",
  "/assets/creative-studio/audio-console.jpg",
  "/assets/creative-studio/mirror-portrait.jpg",
];

const SHOWCASE_MONITORING_DATA: LandingPlatformMonitoringData = {
  totalCount: 12486,
  successRate: 97.8,
  trend: [
    { day: "04/24", requests: 920, errors: 18 },
    { day: "04/25", requests: 1240, errors: 19 },
    { day: "04/26", requests: 1168, errors: 21 },
    { day: "04/27", requests: 1492, errors: 22 },
    { day: "04/28", requests: 1860, errors: 31 },
    { day: "04/29", requests: 1735, errors: 24 },
    { day: "04/30", requests: 2110, errors: 27 },
  ],
  usage: [
    { name: "Image", value: 42, total: 5244, color: "#d4f032" },
    { name: "Video", value: 28, total: 3496, color: "#f5f2df" },
    { name: "Audio", value: 19, total: 2372, color: "#9e8cff" },
    { name: "API", value: 11, total: 1374, color: "#6ee7b7" },
  ],
};

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

export async function LandingPlatformSection() {
  const modelCatalog = await loadModelCatalog();
  const featuredModels = selectFeaturedModels(modelCatalog);

  return (
    <LandingPlatformClientSection
      featuredModels={featuredModels}
      monitoring={SHOWCASE_MONITORING_DATA}
    />
  );
}
