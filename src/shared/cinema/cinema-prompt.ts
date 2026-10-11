import { cinemaOption, type CinemaCategory } from "./cinema-catalog";
import { cinemaCompositionGuidance } from "./cinema-composition-guidance";
import { CINEMA_MAPPING_VERSION, parseCinemaSettings, type CinemaMedia, type CurrentCinemaSnapshot } from "./cinema-contract";

const shootingGuidance = [
  "Keep the intended focus target and requested aspect ratio.",
  "Treat lens model names as optical character references; the selected shot composition and aperture define the intended framing and depth of field.",
  "If the scene explicitly requests a different framing, preserve those instructions as the highest priority.",
];

/** Compose from authoring text only. Persisted execution snapshots already contain the final prompt. */
export function composeCinemaPrompt(sourcePrompt: string, raw: unknown, media: CinemaMedia): CurrentCinemaSnapshot {
  const settings = parseCinemaSettings(raw, media);
  const shot = settings.shootingEnabled ? cinemaOption("composition", settings.composition)?.prompt : undefined;
  const categories: CinemaCategory[] = [
    ...(settings.shootingEnabled ? ["aperture", "camera", "lens"] as CinemaCategory[] : []),
    "palette", "lighting", "artStyle",
    ...(media === "video" ? ["genre", "rhythm", ...(settings.shootingEnabled ? ["movement"] : [])] as CinemaCategory[] : []),
  ];
  const guidance = categories.flatMap(category => {
    const prompt = cinemaOption(category, settings[category])?.prompt; return prompt ? [prompt] : [];
  });
  const hasShootingDirection = settings.shootingEnabled
    && [settings.camera, settings.lens, settings.composition, settings.aperture].some(id => id !== "auto");
  if (hasShootingDirection && !shot) {
    guidance.unshift(...shootingGuidance);
  }
  const sentences = guidance.map(prompt => `${prompt.charAt(0).toUpperCase()}${prompt.slice(1)}${/[.!?:]$/.test(prompt) ? "" : "."}`);
  const direction = `Cinema direction: ${sentences.join(" ")}`;
  // An explicit selection owns framing; focus targets and the authored scene remain separate.
  const scene = shot ? `${shot}\n\n${cinemaCompositionGuidance}${sourcePrompt ? `\n\n${sourcePrompt}` : ""}` : sourcePrompt;
  return { schemaVersion: 2, mappingVersion: CINEMA_MAPPING_VERSION, settings, sourcePrompt,
    finalPrompt: !sentences.length ? scene : `${scene}${scene ? "\n\n" : ""}${direction}` };
}
