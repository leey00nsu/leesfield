"use client";

import Image from "next/image";
import type { CinemaOption } from "@/shared/cinema/cinema-catalog";
import styles from "./cinema-studio-controls.module.css";

export function CinemaImage({ option, priority = false }: { option: CinemaOption; priority?: boolean }) {
  return <Image src={option.image} alt="" width={768} height={768} unoptimized priority={priority} loading={priority ? undefined : "lazy"} className={styles.image} draggable={false} />;
}
