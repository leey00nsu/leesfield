"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/shared/lib/utils";

type LandingHeroMotionLayerProps = {
  children: ReactNode;
  className?: string;
  "data-layer"?: string;
  testId: string;
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
}: LandingHeroMotionLayerProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      data-layer={dataLayer}
      data-testid={testId}
      className={cn("relative", className)}
      initial={shouldReduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
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
