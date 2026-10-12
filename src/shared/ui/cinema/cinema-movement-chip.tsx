"use client";

import { Move, X } from "lucide-react";
import { cinemaOption } from "@/shared/cinema/cinema-catalog";
import { parseCinemaSettings } from "@/shared/cinema/cinema-contract";
import { AppButton } from "@/shared/ui/app-button";
import type { AppPromptToken } from "@/shared/ui/app-prompt-editor";
import styles from "@/shared/ui/app-prompt-chip.module.css";

export const CINEMA_MOVEMENT_TOKEN = "cinema:movement";

export function cinemaMovementToken(raw: unknown, disabled: boolean, clear: () => void, offset = 0): AppPromptToken[] {
  try {
    const settings = parseCinemaSettings(raw, "video");
    const movement = settings.movement === "auto" ? undefined : cinemaOption("movement", settings.movement);
    if (!movement) return [];
    return [{ id: CINEMA_MOVEMENT_TOKEN, label: movement.name, offset,
      content: <span data-cinema-movement-chip="" className={`${styles.chip} rounded-full border border-border bg-secondary`}>
        <Move aria-hidden="true" className="mx-1 size-4 shrink-0" />
        <span className="max-w-64 truncate">{movement.name}</span>
        <AppButton type="button" variant="ghost" size="icon-sm" className="size-7 shrink-0" disabled={disabled}
          aria-label={`Remove ${movement.name}`} onClick={clear}><X className="size-4" /></AppButton>
      </span> }];
  } catch { return []; }
}
