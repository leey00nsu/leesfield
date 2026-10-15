import type { NodeBananaProviderModel } from "@node-banana-runtime/runtime-entry";
import type { NodeAuthoringCatalogState } from "../../model/node-authoring-context";
import type { RuntimeImageModel, RuntimeVideoModel, RuntimeAudioModel } from "@/shared/model-catalog/runtime-utils";
import { resolveGenerationModalities } from "@/shared/model-catalog/modality";

const capabilityByModality: Record<string, NodeBananaProviderModel["capabilities"][number]> = {T2I:"text-to-image", I2I:"image-to-image", T2V:"text-to-video", I2V:"image-to-video", V2V:"video-to-video", A2V:"audio-to-video", T2A:"text-to-audio", A2A:"audio-to-audio"};
export function nodeBananaModelCapabilities(model: RuntimeImageModel | RuntimeVideoModel | RuntimeAudioModel): NodeBananaProviderModel["capabilities"] {
  return resolveGenerationModalities(model).flatMap(modality => capabilityByModality[modality] ? [capabilityByModality[modality]] : []);
}

function webUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try { const url = new URL(value); if (url.protocol === "https:" || url.protocol === "http:") return url.href; } catch { /* unavailable metadata */ }
}

export function nodeBananaCatalogModels(catalog: NodeAuthoringCatalogState): NodeBananaProviderModel[] {
  return [...catalog.imageModels, ...(catalog.videoModels ?? []), ...(catalog.audioModels ?? [])]
    .filter((model) => model.isActive)
    .map((model) => ({
      id: model.key, name: model.label, provider: model.provider as NodeBananaProviderModel["provider"],
      description: typeof model.meta.description === "string" ? model.meta.description : null,
      coverImage: webUrl(model.meta.coverImage),
      pageUrl: webUrl(model.meta.pageUrl),
      capabilities: nodeBananaModelCapabilities(model),
    }));
}
