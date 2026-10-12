import { inputAssetRefsFromSnapshot } from "@/server/generation-request/generation-input-assets";
import { restoreRequest } from "@/server/generation-request/request-snapshot";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import { getGradioContract } from "@/shared/model-catalog/gradio-contract";
import { fileFieldAllowsNullItems } from "@/shared/model-catalog/gradio-file-schema";
import { orderedFileSources, parseFileInputPort } from "@/shared/model-catalog/file-input-ports";
import { historyReferencesSchema, type HistoryReference } from "@/shared/generation/history-references";
import { jsonValueSchema } from "@/shared/model-catalog/gradio-contract";
import { historyOptionsSchema, legacyHistoryOptionPath, legacyHistoryOptionNames, type HistoryOption } from "@/shared/generation/history-options";
import { numericParameterValue } from "@/shared/model-catalog/parameter-contract";

const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const urls = (v: unknown) => typeof v === "string" && v.trim() ? [v] : Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && !!s.trim()) : [];
const privateKey = /(?:api[_-]?key|authorization|password|secret|credential|^(?:access[_-]?token|refresh[_-]?token|token)$)/i;
const privateValue = (v: unknown): boolean => Array.isArray(v) ? v.some(privateValue) : !!v && typeof v === "object" && Object.entries(v).some(([key, value]) => privateKey.test(key) || privateValue(value));

export async function historyAuthoringOptions(media: "image" | "video" | "audio", modelKey: string | null, snapshot: unknown) {
  const raw = restoreRequest(snapshot);
  const frozen = object(raw.executionModel);
  const model = Object.keys(frozen).length ? frozen : (await getModelCatalog({ includeInactive: true })).find(m => m.key === modelKey && m.type === media);
  if (!model) return [];
  const contract = getGradioContract(model);
  const dynamic = object(raw.dynamicParams);
  const options: HistoryOption[] = [];
  const add = (field: string, value: unknown) => {
    if (privateKey.test(field.split(".").at(-1)!) || privateValue(value)) return;
    const parsed = jsonValueSchema.safeParse(value);
    if (parsed.success) options.push({ field, value: parsed.data });
  };
  if (contract) {
    for (const field of contract.inputs) {
      if (field.canonical === "prompt" || ["file", "files", "gallery"].includes(field.kind)) continue;
      if (Object.hasOwn(dynamic, field.name)) add("dynamicParams." + field.name, dynamic[field.name]);
      else if ((legacyHistoryOptionNames[media] as readonly string[]).includes(field.name) && Object.hasOwn(raw, field.name)) {
        add("dynamicParams." + field.name, field.kind === "number" ? numericParameterValue(raw[field.name]) : raw[field.name]);
      }
    }
  } else {
    for (const [key, config] of Object.entries(object(model.parameters))) {
      const path = legacyHistoryOptionPath(media, key, config);
      if (path) add(path, path.startsWith("dynamicParams.") ? dynamic[key] : raw[key]);
    }
  }
  return historyOptionsSchema.parse(options);
}

/** Public owner-checked authoring projection, excluding credentials and execution configuration. */
export async function historyAuthoringReferences(ownerEmail: string, media: "image" | "video" | "audio", modelKey: string | null, snapshot: unknown) {
  const raw = restoreRequest(snapshot);
  const references = new Map<string, HistoryReference>();
  for (const [field, type, multiple] of [["initImages", "image", true], ["initImage", "image", false], ["inputAudio", "audio", false]] as const) {
    const values = urls(raw[field]);
    if (values.length) references.set(field, { field, media: type, multiple, urls: values });
  }
  const dynamic = object(raw.dynamicParams);
  if (Object.keys(dynamic).length) {
    const frozen = object(raw.executionModel);
    const model = Object.keys(frozen).length ? frozen : (await getModelCatalog({ includeInactive: true })).find(m => m.key === modelKey);
    const contract = model ? getGradioContract(model) : null;
    for (const field of contract?.inputs ?? []) {
      if (!["file", "files", "gallery"].includes(field.kind) || !field.media) continue;
      const rawValue=dynamic[field.name];
      const values = fileFieldAllowsNullItems(field)&&Array.isArray(rawValue)?rawValue.map(value=>value===null?null:typeof value==="string"&&value.trim()?value:(()=>{throw new Error("HISTORY_REFERENCE_FIELD_INVALID");})()):urls(rawValue);
      const path = "dynamicParams." + field.name;
      if (values.length) references.set(path, { field: path, media: field.media, multiple: field.kind !== "file", urls: values });
    }
  }
  const groups = new Map<string, ReturnType<typeof inputAssetRefsFromSnapshot>>();
  for (const ref of inputAssetRefsFromSnapshot(media, raw)) {
    const port = parseFileInputPort(ref.field);
    const path = port ? "dynamicParams." + port.name : ref.field === "primary" ? media === "image" ? "initImages" : media === "video" ? "initImage" : "inputAudio" : ref.field;
    if (!historyReferencesSchema.safeParse([{ field: path, media, multiple: true, urls: ["pending"] }]).success) throw new Error("HISTORY_REFERENCE_FIELD_INVALID");
    const group = groups.get(path) ?? [];
    group.push(ref); groups.set(path, group);
  }
  for (const [field, refs] of groups) {
    refs.sort((a, b) => a.sortOrder - b.sortOrder);
    const assets = await Promise.all(refs.map(ref => mediaAssetService.get(ownerEmail, ref.assetId)));
    const type = assets[0].type;
    if (assets.some(asset => asset.type !== type)) throw new Error("HISTORY_REFERENCE_MEDIA_INVALID");
    const frozen=object(raw.executionModel);
    const model=Object.keys(frozen).length?frozen:(await getModelCatalog({includeInactive:true})).find(m=>m.key===modelKey);
    const input=model?getGradioContract(model)?.inputs.find(input=>"dynamicParams."+input.name===field):undefined;
    const positional=!!input&&fileFieldAllowsNullItems(input);
    references.set(field, { field, media: type, multiple: positional || refs[0].multiple === true || field === "initImages", urls: positional?orderedFileSources(assets.map((asset,index)=>({url:asset.url,sortOrder:refs[index].sortOrder})),references.get(field)?.urls.length??0):assets.map(asset => asset.url) });
  }
  return historyReferencesSchema.parse([...references.values()]);
}
