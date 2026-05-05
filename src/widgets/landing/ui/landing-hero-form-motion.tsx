"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

type LandingHeroFormMotionProps = {
  children: ReactNode;
};

export function LandingHeroFormMotion({
  children,
}: LandingHeroFormMotionProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      data-testid="landing-hero-form-motion"
      className="relative"
      initial={shouldReduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        delay: shouldReduceMotion ? 0 : 0.18,
        duration: shouldReduceMotion ? 0 : 0.72,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
