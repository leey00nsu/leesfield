"use client";

import { AppVideoPlayer } from "../app-video-player";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { cinemaMovementOptions, legacyOrbit } from "@/shared/cinema/cinema-movement";
import { AppButton } from "@/shared/ui/app-button";
import styles from "./cinema-movement-grid.module.css";

function MovementVideo({ item, active, root }: {
  item: typeof cinemaMovementOptions[number]; active: boolean; root: RefObject<HTMLDivElement | null>;
}) {
  const t = useTranslations("cinema");
  const reduced = useReducedMotion();
  const element = useRef<HTMLVideoElement>(null);
  const playing = useRef(false);
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(() => typeof document === "undefined" || !document.hidden);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const video = element.current;
    if (!video || !root.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      setVisible(entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .25));
    }, { root: root.current, threshold: [.25] });
    observer.observe(video);
    return () => observer.disconnect();
  }, [root]);
  useEffect(() => {
    const changed = () => setForeground(!document.hidden);
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  const shouldPlay = active && visible && foreground && !reduced && !failed;
  useEffect(() => {
    const video = element.current;
    playing.current = shouldPlay;
    if (!video) return;
    if (shouldPlay) {
      // A delayed autoplay promise must not restart a hidden or closing card.
      void video.play().then(() => { if (!playing.current) video.pause(); }).catch(() => {});
    } else video.pause();
    return () => { playing.current = false; video.pause(); };
  }, [shouldPlay, item.video]);
  useEffect(() => {
    const video = element.current;
    return () => {
      video?.pause();
      video?.removeAttribute("src");
    };
  }, []);
  return <>
    <AppVideoPlayer src={item.video} active={shouldPlay} controls={false} ref={element} poster={item.image} muted loop playsInline preload="none"
      style={{ backgroundImage: `url("${item.image}")`, backgroundSize: "cover", backgroundPosition: "center" }}
      aria-hidden="true" onError={() => setFailed(true)} />
    {failed && <span className={styles.fallback}>{t("movementPreviewUnavailable")}</span>}
  </>;
}

export function CinemaMovementGrid({ value, disabled, active, onChange }: {
  value: string; disabled: boolean; active: boolean; onChange: (id: string) => void;
}) {
  const t = useTranslations("cinema");
  const root = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const items = cinemaMovementOptions;
  return <div className={styles.root}>
    {value === "orbit" && <AppButton type="button" variant="surface" size="sm" disabled={disabled} aria-pressed="true" onClick={() => onChange(legacyOrbit.id)}>{legacyOrbit.name}</AppButton>}
    <div ref={root} className={styles.scroller}>
      <div ref={grid} className={styles.grid} role="group" aria-label={t("movement")} onKeyDown={event => {
        if (disabled || event.nativeEvent.isComposing || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        const buttons = Array.from(grid.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
        const current = buttons.indexOf(event.target as HTMLButtonElement);
        if (current < 0) return;
        event.preventDefault();
        const columns = getComputedStyle(grid.current!).gridTemplateColumns.split(" ").filter(Boolean).length || 4;
        const offset = event.key === "ArrowUp" ? -columns : event.key === "ArrowDown" ? columns : event.key === "ArrowLeft" ? -1 : 1;
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, current + offset));
        buttons[next]?.focus();
        buttons[next]?.scrollIntoView?.({ block: "nearest" });
      }}>
        {items.map(item => <button key={item.id} type="button" disabled={disabled} className={styles.card} aria-label={item.name}
          aria-pressed={item.id === value} onClick={() => onChange(item.id === value ? "auto" : item.id)}>
          <div className={styles.media}><MovementVideo item={item} root={root} active={active && !disabled} />
            <span className={styles.apply} aria-hidden="true">{t("movementApply")}</span></div>
          <span className={styles.name}>{item.name}</span>
        </button>)}
      </div>
    </div>
  </div>;
}
