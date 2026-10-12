import { z } from "zod";
import type { GradioField } from "./gradio-contract";
import { fileFieldAllowsNullItems } from "./gradio-file-schema";

export const attachmentRelationshipSchema = z.object({
  role: z.literal("paired_audio"),
  pairedWith: z.string().min(1).refine(name => !["__proto__", "constructor", "prototype"].includes(name)),
  pairing: z.literal("index"),
}).strict();

/** Parameter null explicitly disables a source declaration. Never infer a relationship. */
export function attachmentRelationship(schema: Record<string, unknown>, parameter: Record<string, unknown> = {}) {
  const raw = Object.hasOwn(parameter, "attachment") ? parameter.attachment : schema["x-attachment"];
  return raw == null ? undefined : attachmentRelationshipSchema.parse(raw);
}

export function assertAttachmentRelationships(fields: readonly GradioField[]) {
  const parents = new Set<string>();
  for (const field of fields) {
    if (!field.attachment) continue;
    attachmentRelationshipSchema.parse(field.attachment);
    const parent = fields.find(candidate => candidate.name === field.attachment!.pairedWith);
    if (field.media !== "audio" || !fileFieldAllowsNullItems(field) || field.hidden || field.choices?.length ||
        !parent || parent === field || parent.media !== "video" || !["files", "gallery"].includes(parent.kind) ||
        parent.hidden || parent.choices?.length || fileFieldAllowsNullItems(parent) || parents.has(parent.name))
      throw new Error("HF_CONTRACT_ATTACHMENT_RELATION_INVALID:" + field.name);
    parents.add(parent.name);
  }
}

export function pairedAudioField(fields: readonly GradioField[], parent: string) {
  return fields.find(field => field.attachment?.pairedWith === parent);
}

/** Preserve omitted trailing slots (provider fallback), and explicit nulls (empty overrides). */
export function reorderPairedSlots<T>(values: readonly (T | null)[], order: readonly number[]): (T | null)[] {
  let end = order.length;
  while (end && order[end - 1] >= values.length) end--;
  // A JSON array cannot represent an omitted slot before a later explicit slot.
  // Do not silently convert a provider fallback to an explicit empty override.
  if (order.slice(0,end).some(index=>index>=values.length)) throw new Error("ATTACHMENT_SLOT_FALLBACK");
  return order.slice(0, end).map(index => values[index] ?? null);
}

export function assertPairedInputValues(fields: readonly GradioField[], values: Record<string, unknown>) {
  for (const field of fields) {
    if (!field.attachment) continue;
    const audio = values[field.name], videos = values[field.attachment.pairedWith];
    if (Array.isArray(audio) && audio.some((value, index) => value != null && (!Array.isArray(videos) || !videos[index])))
      throw new Error("HF_CONTRACT_ATTACHMENT_ORPHAN:" + field.name);
  }
}
