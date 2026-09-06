"use client";

import { useId } from "react";
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
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          {!reduced && (
            <>
              <animate
                attributeName="x1"
                values="-100%;0%;-100%"
                dur="3s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="x2"
                values="100%;200%;100%"
                dur="3s"
                repeatCount="indefinite"
              />
            </>
          )}
          <stop stopColor="var(--brand-gradient-start)" />
          <stop offset="0.5" stopColor="var(--brand-gradient-highlight)" />
          <stop offset="1" stopColor="var(--brand-gradient-start)" />
        </linearGradient>
      </defs>
    </Unplug>
  );
}
