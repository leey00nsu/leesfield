import { z } from "zod";

export function validSpaceDefaultParameters(parameters: Record<string, unknown>, values: Record<string, string | number | boolean>) {
  const definitions = parameters as Record<string, Record<string, unknown>>;
  return Object.entries(values).every(([key, value]) => {
    const config = definitions[key];
    // Defaults are non-secret model controls, never prompts, files, credentials,
    // hidden provider payloads or arbitrary keys submitted by the client.
    if (!config || /^(prompt|negativePrompt|initImage|image|images|audio|video)$|token|secret|password|api.?key/i.test(key)
      || config.binding && typeof config.binding === "object" && (config.binding as { valueType?: string }).valueType === "file"
      || !["range", "slider", "number", "input", "select", "toggle", "text"].includes(String(config.ui))) return false;
    const options = config.options;
    if (Array.isArray(options) && !options.some((option) =>
      (option && typeof option === "object" ? (option as { value: unknown }).value : option) === value)) return false;
    if (config.ui === "toggle") return typeof value === "boolean";
    if (config.ui === "range" || config.ui === "slider" || config.ui === "number" || typeof config.default === "number" || (config.binding as { valueType?: string } | undefined)?.valueType === "number") {
      if (typeof value !== "number") return false;
      if (typeof config.min === "number" && value < config.min) return false;
      if (typeof config.max === "number" && value > config.max) return false;
      if (typeof config.step === "number" && config.step > 0) {
        const steps = (value - (typeof config.min === "number" ? config.min : 0)) / config.step;
        if (Math.abs(steps - Math.round(steps)) > 1e-7) return false;
      }
      return true;
    }
    return typeof value === "string" || (Array.isArray(options) && typeof value === "number");
  });
}

export const spacePreferenceMediaSchema = z.enum(["image", "video", "audio"]);
const modelDefaultSchema = z.object({
  modelKey: z.string().trim().min(1).max(200),
  parameters: z.record(z.string().min(1).max(100), z.union([z.string().max(2000), z.number().finite(), z.boolean()])).default({}),
}).strict();
export const spaceDefaultsSchema = z.object({
  image: modelDefaultSchema.optional(), video: modelDefaultSchema.optional(), audio: modelDefaultSchema.optional(),
}).strict();
export const spacePreferencesSchema = z.object({
  inlineParametersEnabled: z.boolean().optional(),
  schemaVersion: z.literal(1),
  revision: z.number().int().min(0),
  recentModelKeys: z.array(z.string().trim().min(1).max(200)).max(20),
  defaults: spaceDefaultsSchema,
}).strict();
export const updateSpacePreferencesSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("settings"), expectedRevision: z.number().int().min(0), defaults: spaceDefaultsSchema.optional(), inlineParametersEnabled: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("inline"), expectedRevision: z.number().int().min(0), enabled: z.boolean() }).strict(),
  z.object({ action: z.literal("track"), expectedRevision: z.number().int().min(0), modelKey: z.string().trim().min(1).max(200) }).strict(),
  z.object({ action: z.literal("defaults"), expectedRevision: z.number().int().min(0), defaults: spaceDefaultsSchema }).strict(),
]);
export type SpacePreferences = z.infer<typeof spacePreferencesSchema>;
export type SpaceDefaults = z.infer<typeof spaceDefaultsSchema>;
export type SpacePreferenceUpdate = z.infer<typeof updateSpacePreferencesSchema>;

/** Never share this mutable state between users, or persist graph content here. */
export function emptySpacePreferences(): SpacePreferences {
  return { schemaVersion: 1, revision: 0, recentModelKeys: [], defaults: {} };
}
