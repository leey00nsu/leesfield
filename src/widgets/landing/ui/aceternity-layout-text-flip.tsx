"use client";
// Source: Aceternity Layout Text Flip. Keep layers mounted and decoded before cycling.
import { useState, useEffect, useRef, type ReactNode } from "react";
import { motion } from "motion/react";
import { useLandingReducedMotion } from "./use-landing-reduced-motion";

export function LayoutTextFlip({
  text,
  words,
  duration = 1800,
  renderWord,
}: {
  text: string;
  words: string[];
  duration?: number;
  renderWord?: (word: string, index: number) => ReactNode;
}) {
  const reduced = useLandingReducedMotion();
  const [currentIndex, setCurrentIndex] = useState(0);
  const slot = useRef<HTMLSpanElement>(null);
  const wordKey = words.join("|");
  useEffect(() => {
    if (reduced || words.length < 2) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    const layers = Array.from(slot.current?.children ?? []);
    Promise.all(
      layers.map(async (layer, index) => {
        const images = Array.from(layer.querySelectorAll("img"));
        try {
          await Promise.all(images.map((image) => image.decode()));
          return index;
        } catch {
          return -1;
        }
      }),
    ).then((indexes) => {
      const ready = indexes.filter((index) => index >= 0);
      if (cancelled || ready.length < 2) return;
      interval = setInterval(
        () =>
          setCurrentIndex(
            (previous) => ready[(ready.indexOf(previous) + 1) % ready.length],
          ),
        duration,
      );
    });
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [duration, reduced, wordKey, words.length]);
  return (
    <>
      <motion.span
        className="shrink-0"
        initial={reduced ? false : { opacity: 0, filter: "blur(5px)", y: 8 }}
        animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
        transition={{ duration: reduced ? 0 : 0.72 }}
      >
        {text}
      </motion.span>
      <motion.span
        initial={reduced ? false : { opacity: 0, y: 8, filter: "blur(5px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: reduced ? 0 : 0.72 }}
        ref={slot}
        className="relative inline-flex size-[0.85em] shrink-0 items-center justify-center overflow-visible leading-none"
      >
        {words.map((word, index) => (
          <motion.span
            key={word}
            aria-hidden={index !== currentIndex}
            initial={false}
            animate={{
              opacity: index === currentIndex ? 1 : 0,
              y: index === currentIndex ? 0 : 8,
              filter: index === currentIndex ? "blur(0px)" : "blur(6px)",
            }}
            transition={{ duration: reduced ? 0 : 0.3 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center leading-none"
          >
            {renderWord ? renderWord(word, index) : word}
          </motion.span>
        ))}
      </motion.span>
    </>
  );
}
