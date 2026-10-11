"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cinemaOptions, type CinemaCategory, type CinemaOption } from "@/shared/cinema/cinema-catalog";
import { AppButton } from "@/shared/ui/app-button";
import { CinemaImage } from "./cinema-image";
import styles from "./cinema-studio-controls.module.css";

const wrap = (value: number, count: number) => ((value % count) + count) % count;
const offset = (value: number, count: number) => wrap(value + count / 2, count) - count / 2;

function Cover({ option, index, count, position, width, selected, disabled, name, onSelect }: {
  option: CinemaOption; index: number; count: number; position: MotionValue<number>; width: number;
  selected: boolean; disabled: boolean; name: string; onSelect: () => void;
}) {
  const transform = useTransform(position, pos => {
    const d = offset(index - pos, count);
    const falloff = Math.pow(Math.abs(d), .56);
    const x = Math.sign(d) * Math.pow(Math.abs(d), .78) * width * .86;
    const tilt = -Math.sign(d) * Math.min(82, falloff * 44);
    return `translate3d(calc(-50% + ${x}px), -50%, ${-falloff * width * .6}px) rotateY(${tilt}deg)`;
  });
  const opacity = useTransform(position, pos => {
    const distance = Math.abs(offset(index - pos, count));
    const seam = Math.min(1, Math.max(0, (count / 2 - distance) / .45));
    return Math.max(.25, 1 - distance * .16) * seam;
  });
  const zIndex = useTransform(position, pos => count - Math.round(Math.abs(offset(index - pos, count))));
  return <motion.button type="button" className={styles.carouselCard} style={{ transform, opacity, zIndex, width, height: width }}
    tabIndex={-1} disabled={disabled} aria-label={name} aria-pressed={selected} onClick={onSelect}>
    <CinemaImage option={option} priority={selected} /><span>{name}</span>
  </motion.button>;
}

export function CinemaCoverflow({ category, value, disabled, onChange }: {
  category: CinemaCategory; value: string; disabled: boolean; onChange: (id: string) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("cinema");
  const reducedMotion = useReducedMotion();
  const options = cinemaOptions(category);
  const index = options.findIndex(option => option.id === value);
  const position = useMotionValue(index);
  const target = useRef(index);
  const animation = useRef<ReturnType<typeof animate> | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(228);
  const gesture = useRef<{ pointer: number; x: number; y: number; start: number; lastX: number; time: number; velocity: number; dragging: boolean } | null>(null);
  const suppressClick = useRef(false);
  const name = (option: CinemaOption) => locale === "ko" ? option.ko : option.name;
  const settle = (next: number) => {
    animation.current?.stop();
    target.current = next;
    if (reducedMotion) position.set(next);
    else animation.current = animate(position, next, { type: "spring", stiffness: 230, damping: 32, mass: .8 });
  };
  const select = (next: number) => {
    if (disabled) return;
    settle(next);
    onChange(options[wrap(next, options.length)].id);
  };
  const selectIndex = (next: number) => select(target.current + offset(next - target.current, options.length));
  useEffect(() => {
    const element = stage.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.min(260, Math.max(148, entry.contentRect.width * .28))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    // Controlled resets, restored history, or a new category also reset the settle destination.
    if (wrap(Math.round(target.current), options.length) !== index || disabled) {
      animation.current?.stop();
      const next = target.current + offset(index - target.current, options.length);
      target.current = next;
      gesture.current = null;
      if (reducedMotion || disabled) position.set(next);
      else animation.current = animate(position, next, { duration: .34, ease: [.22, 1, .36, 1] });
    }
    if (reducedMotion) { animation.current?.stop(); position.set(target.current); }
  }, [index, options.length, disabled, reducedMotion, position]);
  useEffect(() => () => { animation.current?.stop(); }, []);
  return <div className={styles.carousel} role="group" aria-label={t(category)}>
    <div ref={stage} className={styles.carouselStage} style={{ perspective: width * 3 }} role="region"
      aria-roledescription="carousel" aria-label={t(category)} tabIndex={disabled ? -1 : 0} data-disabled={disabled}
      onKeyDown={event => {
        if (disabled || event.nativeEvent.isComposing || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        if (event.key === "Home") selectIndex(0);
        else if (event.key === "End") selectIndex(options.length - 1);
        else select(target.current + (event.key === "ArrowLeft" ? -1 : 1));
      }}
      onPointerDown={event => {
        if (disabled || !event.isPrimary || event.button !== 0) return;
        suppressClick.current = false;
        gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, start: position.get(), lastX: event.clientX, time: event.timeStamp, velocity: 0, dragging: false };
      }}
      onPointerMove={event => {
        const current = gesture.current;
        if (disabled || !current || current.pointer !== event.pointerId) return;
        const dx = event.clientX - current.x;
        const dy = event.clientY - current.y;
        if (!current.dragging) {
          if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { gesture.current = null; return; }
          if (Math.abs(dx) < 6) return;
          current.dragging = true;
          suppressClick.current = true;
          animation.current?.stop();
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        event.preventDefault();
        const elapsed = Math.max(1, event.timeStamp - current.time);
        current.velocity = (current.lastX - event.clientX) / (width * .86) / elapsed * 1000;
        current.lastX = event.clientX;
        current.time = event.timeStamp;
        position.set(current.start - dx / (width * .86));
      }}
      onPointerUp={event => {
        const current = gesture.current;
        gesture.current = null;
        if (!current || !current.dragging) return;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        const velocity = event.timeStamp - current.time > 100 ? 0 : current.velocity;
        const throwDistance = reducedMotion ? 0 : Math.max(-1.5, Math.min(1.5, velocity * .14));
        select(Math.round(position.get() + throwDistance));
      }}
      onPointerCancel={() => { gesture.current = null; settle(target.current); }}
      onLostPointerCapture={() => { if (gesture.current?.dragging) { gesture.current = null; settle(target.current); } }}
      onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
      {options.map((option, i) => <Cover key={option.id} option={option} index={i} count={options.length} position={position} width={width} selected={i === index} disabled={disabled} name={name(option)} onSelect={() => selectIndex(i)} />)}
    </div>
    <div className={styles.carouselNavigation}>
      <AppButton type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={t("previousCategory", { category: t(category) })} onClick={() => select(target.current - 1)}><ChevronLeft size={18} /></AppButton>
      <div className={styles.dots}>{options.map((option, i) => <button key={option.id} type="button" disabled={disabled} aria-label={name(option)} aria-pressed={i === index} onClick={() => selectIndex(i)} />)}</div>
      <AppButton type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={t("nextCategory", { category: t(category) })} onClick={() => select(target.current + 1)}><ChevronRight size={18} /></AppButton>
    </div>
    <p className={styles.carouselName} aria-live="polite">{name(options[index])}<span>{index + 1} / {options.length}</span></p>
  </div>;
}
