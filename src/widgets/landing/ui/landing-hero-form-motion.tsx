"use client";
import { useLandingReducedMotion as useReducedMotion } from "./use-landing-reduced-motion";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/shared/lib/utils";

type LandingHeroMotionLayerProps = {
  children?: ReactNode;
  className?: string;
  "data-layer"?: string;
  testId: string;
  glass?: boolean;
};

const landingHeroFadeTransition = {
  delay: 0.18,
  duration: 0.72,
  ease: [0.22, 1, 0.36, 1],
} as const;

export function LandingHeroMotionLayer({
  children,
  className,
  "data-layer": dataLayer,
  testId,
  glass = false,
}: LandingHeroMotionLayerProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      data-layer={dataLayer}
      data-testid={testId}
      className={cn("relative", className)}
      initial={shouldReduceMotion ? false : glass ? {y: 28, scale: 0.98} : { opacity: 0 }}
      animate={glass ? {y: 0, scale: 1} : { opacity: 1 }}
      transition={{
        delay: shouldReduceMotion ? 0 : landingHeroFadeTransition.delay,
        duration: shouldReduceMotion ? 0 : landingHeroFadeTransition.duration,
        ease: landingHeroFadeTransition.ease,
      }}
    >
      {children}
    </motion.div>
  );
}
