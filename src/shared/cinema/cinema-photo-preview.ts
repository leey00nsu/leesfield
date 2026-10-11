import { cinemaCatalog } from "./cinema-catalog";
import type { CinemaSettings } from "./cinema-contract";
export const defaultCinemaPhoto = { src: "/assets/cinema/previews/full.webp", composition: "full" };
export function cinemaPhotoPreview(settings: CinemaSettings) {
  if (!settings.shootingEnabled) return defaultCinemaPhoto;
  const composition = cinemaCatalog.composition.some(item => item.id === settings.composition) ? settings.composition : defaultCinemaPhoto.composition;
  return { src: `/assets/cinema/previews/${composition}.webp`, composition };
}
