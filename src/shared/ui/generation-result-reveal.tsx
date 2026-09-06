"use client";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
export function GenerationResultReveal({ visible, children, className }: { visible: boolean; children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return <motion.div className={className} initial={false} animate={{ height: visible ? "auto" : 0, opacity: visible ? 1 : 0 }} transition={{ duration: reduced ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }} style={{ overflow: "hidden" }}>
    {visible ? children : null}
  </motion.div>;
}
