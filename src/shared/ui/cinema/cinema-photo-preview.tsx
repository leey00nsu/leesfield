"use client";

import { useState } from "react";
import { AppPreviewImage } from "@/shared/ui/app-preview-image";
import { useLocale } from "next-intl";
import { cinemaOptionName } from "@/shared/cinema/cinema-catalog";
import type { CinemaSettings } from "@/shared/cinema/cinema-contract";
import { cinemaPhotoPreview, defaultCinemaPhoto } from "@/shared/cinema/cinema-photo-preview";
import styles from "./cinema-studio-controls.module.css";

function PhotoFrame({ photo }: { photo: ReturnType<typeof cinemaPhotoPreview> }) {
  const ko = useLocale() === "ko";
  const [failure, setFailure] = useState<"fallback" | "unavailable" | null>(null);
  const shown = failure === "fallback" ? defaultCinemaPhoto : photo;
  return <figure className={styles.preview}>
    {failure !== "unavailable" && shown.src && <AppPreviewImage key={shown.src} src={shown.src}
      alt={`${ko ? "카메라 미리보기" : "Camera preview"} · ${cinemaOptionName("composition", shown.composition, ko ? "ko" : "en")}`}
      width={1376} height={768} fetchPriority="high" loading="eager" className="size-full object-contain" draggable={false}
      onError={() => setFailure(failure === "fallback" || photo.src === defaultCinemaPhoto.src ? "unavailable" : "fallback")} />}
    {failure && <figcaption className={styles.previewStatus} role="status">
      {failure === "fallback"
        ? ko ? "이미지를 불러오지 못해 전신 샷 예시를 표시합니다." : "The image could not load. Showing the Full shot example."
        : ko ? "미리보기 이미지를 불러올 수 없습니다." : "The preview image could not load."}
    </figcaption>}
  </figure>;
}

export function CinemaPhotoPreview({ settings }: { settings: CinemaSettings }) {
  const photo = cinemaPhotoPreview(settings);
  return <PhotoFrame key={photo.src} photo={photo} />;
}
