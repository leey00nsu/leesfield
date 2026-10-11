import { z } from "zod";
import { cinemaCatalog, type CinemaCategory, legacyCinemaFocalLengths } from "./cinema-catalog";

export const CINEMA_MAPPING_VERSION = 8 as const;
const selection = (category: CinemaCategory) => z.enum(["auto", ...cinemaCatalog[category].map(item => item.id)] as [string, ...string[]]).default("auto");
export const cinemaSettingsSchema = z.object({
  schemaVersion: z.literal(2),
  shootingEnabled: z.boolean().default(true),
  camera: selection("camera"), lens: selection("lens"), composition: selection("composition"), aperture: selection("aperture"),
  palette: selection("palette"), lighting: selection("lighting"), artStyle: selection("artStyle"),
  genre: selection("genre"), rhythm: selection("rhythm"), movement: selection("movement"),
}).strict();
export type CinemaSettings = z.infer<typeof cinemaSettingsSchema>;
export const defaultCinemaSettings = (): CinemaSettings => cinemaSettingsSchema.parse({ schemaVersion: 2 });
// Legacy snapshots remain untransformed; only editable settings are upgraded.
export const legacyCinemaSettingsSchema = cinemaSettingsSchema.omit({ schemaVersion: true, composition: true }).extend({
  schemaVersion: z.literal(1),
  focalLength: z.enum(["auto", ...legacyCinemaFocalLengths.map(item => item.id)] as [string, ...string[]]).default("auto"),
}).strict();
const snapshotFields = { sourcePrompt: z.string(), finalPrompt: z.string() };
export const currentCinemaSnapshotSchema = z.object({
  schemaVersion: z.literal(2), mappingVersion: z.literal(CINEMA_MAPPING_VERSION),
  settings: cinemaSettingsSchema, ...snapshotFields,
}).strict();
export type CurrentCinemaSnapshot = z.infer<typeof currentCinemaSnapshotSchema>;
const previousShotSettingsSchema = cinemaSettingsSchema.extend({
  composition: z.enum(["auto", "extreme-wide", "wide", "medium-wide", "medium", "medium-close-up", "close-up", "extreme-close-up"]).default("auto"),
});
export const cinemaSnapshotSchema = z.union([
  z.object({ schemaVersion: z.literal(1), mappingVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
    settings: legacyCinemaSettingsSchema, ...snapshotFields }).strict(),
  z.object({ schemaVersion: z.literal(2), mappingVersion: z.literal(7),
    settings: previousShotSettingsSchema, ...snapshotFields }).strict(),
  currentCinemaSnapshotSchema,
]);
export type CinemaSnapshot = z.infer<typeof cinemaSnapshotSchema>;
export type CinemaMedia = "image" | "video";
export class CinemaSettingsError extends Error {
  constructor(public readonly code: "CINEMA_SETTINGS_UNSUPPORTED" | "CINEMA_VIDEO_ONLY" | "CINEMA_PROMPT_UNSUPPORTED") {
    super(code); this.name = "CinemaSettingsError";
  }
}
export function readCinemaSettings(raw: unknown): { status: "valid" | "legacy-auto"; settings: CinemaSettings } | { status: "unsupported"; raw: unknown } {
  if (raw === undefined) return { status: "legacy-auto", settings: defaultCinemaSettings() };
  const parsed = cinemaSettingsSchema.safeParse(raw);
  if (parsed.success) return { status: "valid", settings: parsed.data };
  const legacy = legacyCinemaSettingsSchema.safeParse(raw);
  if (legacy.success) {
    const { focalLength: _removed, ...settings } = legacy.data;
    void _removed;
    return { status: "valid", settings: cinemaSettingsSchema.parse({ ...settings, schemaVersion: 2, composition: "auto" }) };
  }
  return { status: "unsupported", raw };
}
export function parseCinemaSettings(raw: unknown, media: CinemaMedia): CinemaSettings {
  const read = readCinemaSettings(raw);
  if (read.status === "unsupported") throw new CinemaSettingsError("CINEMA_SETTINGS_UNSUPPORTED");
  if (media === "image" && [read.settings.genre, read.settings.rhythm, read.settings.movement].some(id => id !== "auto"))
    throw new CinemaSettingsError("CINEMA_VIDEO_ONLY");
  return read.settings;
}
export function hasCinemaGuidance(settings: CinemaSettings, media: CinemaMedia) {
  return [settings.palette, settings.lighting, settings.artStyle, ...(media === "video" ? [settings.genre, settings.rhythm] : []),
    ...(settings.shootingEnabled ? [settings.camera, settings.lens, settings.composition, settings.aperture, ...(media === "video" ? [settings.movement] : [])] : [])].some(id => id !== "auto");
}
export function cinemaPresetConflict(settings: CinemaSettings, key?: string) {
  return settings.shootingEnabled && [settings.camera, settings.lens, settings.composition, settings.aperture].some(id => id !== "auto")
    && (key === "multi-camera-nine-grid" || key === "location-sheet");
}
