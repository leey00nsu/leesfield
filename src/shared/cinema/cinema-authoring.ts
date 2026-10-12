import { cinemaPresetConflict, hasCinemaGuidance, parseCinemaSettings, type CinemaMedia } from "./cinema-contract";
import { applyCinemaFinalPrompt, cinemaPromptField } from "./cinema-model-support";
import { composeCinemaPrompt } from "./cinema-prompt";

/** Validate composed instructions without replacing the saved authoring text. */
export function cinemaAuthoringValidation<T extends { prompt?: string; dynamicParams?: Record<string, unknown> }>(
  values: T, raw: unknown, media: CinemaMedia, model: { providerConfig?: unknown; parameters?: unknown } | undefined,
): T {
  try {
    const settings = parseCinemaSettings(raw, media);
    if (!hasCinemaGuidance(settings, media) || !cinemaPromptField(model ?? {}).supported) return values;
    const finalPrompt = composeCinemaPrompt(values.prompt ?? "", settings, media).finalPrompt;
    return applyCinemaFinalPrompt(model ?? {}, values, finalPrompt) as T;
  } catch { return values; }
}

export function cinemaAuthoringBlocked(raw: unknown, media: CinemaMedia, model: { providerConfig?: unknown; parameters?: unknown } | undefined, presetKey?: string) {
  try {
    const settings = parseCinemaSettings(raw, media);
    return cinemaPresetConflict(settings, presetKey) || (!cinemaPromptField(model ?? {}).supported && hasCinemaGuidance(settings, media));
  } catch { return true; }
}
