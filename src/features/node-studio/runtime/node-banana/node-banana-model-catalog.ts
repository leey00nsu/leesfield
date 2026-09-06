import type { NodeBananaProviderModel } from "@node-banana-runtime/runtime-entry";
import type { NodeAuthoringCatalogState } from "../../model/node-authoring-context";
import { resolveRuntimeImageMaxInputImages, resolveRuntimeVideoSupportsInitImage } from "@/shared/model-catalog/runtime-utils";

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
      capabilities: (model.type === "image" ? resolveRuntimeImageMaxInputImages(model) > 0 ? ["text-to-image", "image-to-image"] : ["text-to-image"]
        : model.type === "video" ? resolveRuntimeVideoSupportsInitImage(model) ? ["text-to-video", "image-to-video"] : ["text-to-video"]
          : ["text-to-audio"]) as NodeBananaProviderModel["capabilities"],
    }));
}
