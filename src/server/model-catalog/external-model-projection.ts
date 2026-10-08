import { externalAdminModelSchema, externalAdminDraftSchema } from "@/shared/api/platform-admin-contract";
const sensitive = /(?:api[_-]?key|keyHash|authorization|password|secret|credential|ciphertext|^(?:token|access[_-]?token|refresh[_-]?token|auth[_-]?token|iv|authTag|__proto__|constructor|prototype)$)/i;
const configKeys = new Set([
  "space_id", "space_url", "api_name", "input_rules", "gradio_contract", "output", "timeout_ms",
  "input_images_format", "input_audio_format", "model_id", "agent_model", "base_url", "supports_images",
  "connection_id", "workflow_id", "workflow", "limits",
]);
function clean(value: unknown, depth = 0): unknown {
  if (depth > 30) return null;
  if (Array.isArray(value)) return value.map((item) => clean(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !sensitive.test(key)).map(([key, item]) => [key, clean(item, depth + 1)]));
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      url.username = ""; url.password = "";
      for (const key of [...url.searchParams.keys()]) if (sensitive.test(key)) url.searchParams.delete(key);
      return url.toString();
    } catch { return null; }
  }
  return value;
}
function fields(record: Record<string, unknown>) {
  const config = record.providerConfig && typeof record.providerConfig === "object" ? record.providerConfig as Record<string, unknown> : {};
  return {
    type: record.type, key: record.key, label: record.label, vendor: record.vendor, provider: record.provider,
    providerConfig: clean(Object.fromEntries(Object.entries(config).filter(([key]) => configKeys.has(key)))),
    parameters: clean(record.parameters), meta: clean(record.meta),
    isActive: record.isActive ?? true, isDefault: record.isDefault ?? false,
  };
}
export function projectExternalAdminModel(record: Record<string, unknown>) {
  return externalAdminModelSchema.parse({
    ...fields(record), id: record.id, ...(typeof record.hasApiKey === "boolean" ? { hasApiKey: record.hasApiKey } : {}),
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt,
  });
}
export function projectExternalModelDraft(record: Record<string, unknown>) {
  return externalAdminDraftSchema.parse(fields(record));
}
