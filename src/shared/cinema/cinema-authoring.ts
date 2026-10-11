import { cinemaPresetConflict, hasCinemaGuidance, parseCinemaSettings, type CinemaMedia } from "./cinema-contract";
import { cinemaPromptField } from "./cinema-model-support";

export function cinemaAuthoringBlocked(raw: unknown, media: CinemaMedia, model: { providerConfig?: unknown; parameters?: unknown } | undefined, presetKey?: string) {
  try {
    const settings = parseCinemaSettings(raw, media);
    return cinemaPresetConflict(settings, presetKey) || (!cinemaPromptField(model ?? {}).supported && hasCinemaGuidance(settings, media));
  } catch { return true; }
}
