"use client";

import { AppPreviewImage } from "@/shared/ui/app-preview-image";
import type { CinemaOption } from "@/shared/cinema/cinema-catalog";
import styles from "./cinema-studio-controls.module.css";

export function CinemaImage({ option, priority = false }: { option: CinemaOption; priority?: boolean }) {
  return <AppPreviewImage src={option.image} alt="" width={768} height={768} fetchPriority={priority ? "high" : "auto"} loading={priority ? "eager" : "lazy"} className={styles.image} draggable={false} />;
}
