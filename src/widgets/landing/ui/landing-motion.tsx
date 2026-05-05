"use client";

import type { CSSProperties, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/shared/lib/utils";

const landingEase = [0.22, 1, 0.36, 1] as const;

type LandingRevealProps = {
  children?: ReactNode;
  className?: string;
  testId?: string;
  delay?: number;
  duration?: number;
  y?: number;
  scale?: number;
  once?: boolean;
  viewportMargin?: string;
};

export function LandingReveal({
  children,
  className,
  testId,
  delay = 0,
  duration = 0.62,
  y = 18,
  scale = 1,
  once = true,
  viewportMargin = "-12% 0px",
}: LandingRevealProps) {
  const reduceMotion = useReducedMotion();
  const initial = scale === 1 ? { opacity: 0, y } : { opacity: 0, y, scale };

  return (
    <motion.div
      data-landing-motion="reveal"
      data-testid={testId}
      className={className}
      initial={reduceMotion ? false : initial}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once, margin: viewportMargin }}
      transition={{
        delay: reduceMotion ? 0 : delay,
        duration: reduceMotion ? 0 : duration,
        ease: landingEase,
      }}
    >
      {children}
    </motion.div>
  );
}

type LandingScaleYProps = {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  testId?: string;
  delay?: number;
  duration?: number;
};

export function LandingScaleY({
  children,
  className,
  style,
  testId,
  delay = 0,
  duration = 0.52,
}: LandingScaleYProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.span
      data-landing-motion="scale-y"
      data-testid={testId}
      className={cn("origin-bottom", className)}
      style={style}
      initial={reduceMotion ? false : { opacity: 0, scaleY: 0.18 }}
      whileInView={{ opacity: 1, scaleY: 1 }}
      viewport={{ once: true, margin: "-12% 0px" }}
      transition={{
        delay: reduceMotion ? 0 : delay,
        duration: reduceMotion ? 0 : duration,
        ease: landingEase,
      }}
    >
      {children}
    </motion.span>
  );
}
