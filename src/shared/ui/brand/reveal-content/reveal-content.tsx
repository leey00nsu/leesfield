"use client";

import type { HTMLMotionProps } from "motion/react";
import { motion, stagger, useAnimate, useInView, useReducedMotion } from "motion/react";
import { useEffect } from "react";

import { cn } from "@/shared/lib/utils";

import styles from "./reveal-content.module.css";

type RevealContentProps = HTMLMotionProps<"div"> & {
  delay?: number;
  distance?: number;
  duration?: number;
  fromOpacity?: number;
  variant?: "default" | "fade" | "group" | "line" | "section" | "stagger";
};

const variantDefaults = {
  default: { distance: 8, duration: 700, fromOpacity: 0.94 },
  fade: { distance: 0, duration: 800, fromOpacity: 0 },
  group: { distance: 6, duration: 800, fromOpacity: 0 },
  line: { distance: 0, duration: 700, fromOpacity: 1 },
  section: { distance: 16, duration: 700, fromOpacity: 0 },
  stagger: { distance: 0, duration: 650, fromOpacity: 1 },
} as const;

const revealEase = [0.22, 1, 0.36, 1] as const;

// Motion-backed one-shot reveal adapted from the React Bits Fade/Animated Content pattern.
function RevealContent({
  className,
  delay = 0,
  distance,
  duration,
  fromOpacity,
  style,
  variant = "default",
  ...props
}: RevealContentProps) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const inView = useInView(scope, { amount: 0.08, margin: "0px 0px -10% 0px", once: true });
  const shouldReduceMotion = Boolean(useReducedMotion());
  const defaults = variantDefaults[variant];
  const resolvedDistance = distance ?? defaults.distance;
  const resolvedDuration = duration ?? defaults.duration;
  const resolvedOpacity = fromOpacity ?? defaults.fromOpacity;
  const usesChildSequence = variant === "line" || variant === "stagger";

  useEffect(() => {
    if (!usesChildSequence || (!inView && !shouldReduceMotion)) return;
    const instant = shouldReduceMotion;
    const baseDelay = instant ? 0 : delay / 1000;

    if (variant === "stagger") {
      animate(
        "[data-reveal-item]",
        { opacity: 1, y: 0 },
        {
          delay: instant ? 0 : stagger(0.07, { startDelay: baseDelay }),
          duration: instant ? 0 : 0.65,
          ease: revealEase,
        },
      );
      if (scope.current.querySelector("[data-reveal-media]")) {
        animate(
          "[data-reveal-media]",
          { scale: 1 },
          {
            delay: instant ? 0 : stagger(0.07, { startDelay: baseDelay }),
            duration: instant ? 0 : 0.9,
            ease: revealEase,
          },
        );
      }
      return;
    }

    animate("[data-reveal-line]", { scaleX: 1 }, { delay: baseDelay, duration: instant ? 0 : 0.75, ease: revealEase });
    animate(
      "[data-reveal-item]",
      { opacity: 1 },
      {
        delay: instant ? 0 : stagger(0.07, { startDelay: baseDelay + 0.16 }),
        duration: instant ? 0 : 0.65,
        ease: revealEase,
      },
    );
  }, [animate, delay, inView, scope, shouldReduceMotion, usesChildSequence, variant]);

  return (
    <motion.div
      animate={usesChildSequence || !inView ? undefined : { opacity: 1, y: 0 }}
      className={cn(styles.root, styles[variant], className)}
      data-reveal-variant={variant}
      initial={usesChildSequence || shouldReduceMotion ? false : { opacity: resolvedOpacity, y: resolvedDistance }}
      ref={scope}
      style={
        {
          ...style,
          "--reveal-delay": `${delay}ms`,
          "--reveal-distance": `${resolvedDistance}px`,
          "--reveal-duration": `${resolvedDuration}ms`,
          "--reveal-opacity": resolvedOpacity,
        } as React.CSSProperties
      }
      transition={{ delay: delay / 1000, duration: resolvedDuration / 1000, ease: revealEase }}
      {...props}
    />
  );
}

export { RevealContent };
