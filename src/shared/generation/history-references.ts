import { fileFieldAllowsNullItems } from "@/shared/model-catalog/gradio-file-schema";
import { z } from "zod";
import { fileFieldMaxItems, getGradioContract } from "@/shared/model-catalog/gradio-contract";
import { resolveRuntimeAudioSupportsInputAudio, resolveRuntimeImageMaxInputImages, resolveRuntimeVideoSupportsInitImage, type RuntimeAudioModel, type RuntimeImageModel, type RuntimeVideoModel } from "@/shared/model-catalog/runtime-utils";

export const historyReferencesSchema = z.array(z.object({
  field: z.string().regex(/^(initImages|initImage|inputAudio|dynamicParams\.[a-zA-Z][a-zA-Z0-9_]*)$/).refine(v => !["constructor", "prototype", "__proto__"].includes(v.split(".").at(-1)!)),
  media: z.enum(["image", "video", "audio"]),
  urls: z.array(z.string().min(1).nullable()).min(1),
  multiple: z.boolean(),
}));
export type HistoryReference = z.infer<typeof historyReferencesSchema>[number];

/** Validate the whole restoration before touching the draft; never truncate or guess a file field. */
export function historyReferenceUpdates(references: HistoryReference[], model: RuntimeImageModel | RuntimeVideoModel | RuntimeAudioModel) {
  const contract = getGradioContract(model);
  const updates: Record<string, string | (string|null)[]> = {};
  for (const ref of references) {
    let path = ref.field;
    let multiple = ref.multiple;
    let max = 0;
    let nullableItems=false;
    if (contract) {
      const files = contract.inputs.filter(f => ["file", "files", "gallery"].includes(f.kind) && f.media === ref.media);
      const candidates = path.startsWith("dynamicParams.") ? files.filter(f => f.name === path.slice(14)) : files;
      if (candidates.length !== 1) throw new Error("HISTORY_REFERENCE_FIELD_UNAVAILABLE");
      const field = candidates[0];
      path = "dynamicParams." + field.name;
      multiple = field.kind !== "file";
      max = fileFieldMaxItems(field);
      nullableItems=fileFieldAllowsNullItems(field);
    } else if (model.type === "image" && path === "initImages" && ref.media === "image") {
      multiple = true; max = resolveRuntimeImageMaxInputImages(model);
    } else if (model.type === "video" && path === "initImage" && ref.media === "image") {
      multiple = false; max = resolveRuntimeVideoSupportsInitImage(model) ? 1 : 0;
    } else if (model.type === "audio" && path === "inputAudio" && ref.media === "audio") {
      multiple = false; max = resolveRuntimeAudioSupportsInputAudio(model) ? 1 : 0;
    }
    if ((!nullableItems&&ref.urls.includes(null)) || !max || ref.urls.length > max || Object.hasOwn(updates, path)) throw new Error("HISTORY_REFERENCE_INCOMPATIBLE");
    updates[path] = multiple ? ref.urls : ref.urls[0]!;
  }
  return updates;
}
