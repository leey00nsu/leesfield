"use client";

import { useId } from "react";
import { motion } from "motion/react";
import { Unplug } from "lucide-react";
import { useLandingReducedMotion } from "./use-landing-reduced-motion";

// CopySinger GradientText's horizontal, reversing gradient adapted to SVG strokes.
export function BrandUnplug() {
  const id = useId();
  const reduced = useLandingReducedMotion();
  return (
    <Unplug
      aria-hidden
      className="size-[0.78em] shrink-0"
      stroke={`url(#${id})`}
    >
      <defs>
        <motion.linearGradient id={id} y1="0%" y2="100%"
          initial={false}
          animate={{ x1: reduced ? "0%" : ["-100%", "0%"], x2: reduced ? "100%" : ["100%", "200%"] }}
          transition={{ duration: 1.5, ease: "linear", repeat: reduced ? 0 : Infinity, repeatType: "reverse" }}>
          <stop stopColor="var(--brand-gradient-start)" />
          <stop offset="0.5" stopColor="var(--brand-gradient-highlight)" />
          <stop offset="1" stopColor="var(--brand-gradient-start)" />
        </motion.linearGradient>
      </defs>
    </Unplug>
  );
}
