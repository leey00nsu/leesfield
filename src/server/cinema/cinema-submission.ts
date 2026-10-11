import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import { recordObject } from "@/server/generation-request/request-snapshot";
import { cinemaPresetConflict, hasCinemaGuidance, parseCinemaSettings, type CinemaMedia, type CinemaSnapshot } from "@/shared/cinema/cinema-contract";
import { applyCinemaFinalPrompt, cinemaPromptField, cinemaSourcePrompt } from "@/shared/cinema/cinema-model-support";
import { composeCinemaPrompt } from "@/shared/cinema/cinema-prompt";

/** Internal authoring only. Metadata never enters the provider payload. */
export async function prepareCinemaSubmission(media: CinemaMedia, body: unknown, options: { resolvedPrompt?: string } = {}): Promise<{ payload: unknown; cinema?: CinemaSnapshot }> {
  const incoming = recordObject(body);
  if (!Object.hasOwn(incoming, "cinema")) return { payload: body };
  const { cinema: raw, ...payload } = incoming;
  const settings = parseCinemaSettings(raw, media);
  if (raw === undefined) throw new Error("CINEMA_SETTINGS_UNSUPPORTED");
  if (cinemaPresetConflict(settings, typeof recordObject(payload.promptPreset).key === "string" ? String(recordObject(payload.promptPreset).key) : undefined))
    throw new Error("CINEMA_PRESET_CONFLICT");
  const model = (await getModelCatalog()).find(item => item.type === media && item.key === payload.model);
  if (!model) return { payload }; // The existing model validator owns this error.
  const supported = cinemaPromptField(model).supported;
  if (!supported && hasCinemaGuidance(settings, media)) throw new Error("CINEMA_PROMPT_UNSUPPORTED");
  const cinema = composeCinemaPrompt(options.resolvedPrompt ?? cinemaSourcePrompt(model, payload), settings, media);
  return { payload: supported ? applyCinemaFinalPrompt(model, payload, cinema.finalPrompt) : payload, cinema };
}

export function cinemaSubmissionError(error: unknown): string | undefined {
  const code = error instanceof Error ? error.message : "";
  return ["CINEMA_SETTINGS_UNSUPPORTED", "CINEMA_VIDEO_ONLY", "CINEMA_PROMPT_UNSUPPORTED", "CINEMA_PRESET_CONFLICT"].includes(code) ? code : undefined;
}
