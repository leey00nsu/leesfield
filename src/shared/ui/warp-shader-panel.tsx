"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Warp } from "@paper-design/shaders-react";
import { cn } from "@/shared/lib/utils";

type WarpShaderPanelProps = {
  className?: string;
  fadeIn?: boolean;
};

export function WarpShaderPanel({
  className,
  fadeIn = false,
}: WarpShaderPanelProps) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (!window.matchMedia) {
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setReduceMotion(media.matches);

    updateMotionPreference();
    media.addEventListener("change", updateMotionPreference);

    return () => {
      media.removeEventListener("change", updateMotionPreference);
    };
  }, []);

  return (
    <motion.div
      initial={fadeIn ? { opacity: 0 } : false}
      animate={{ opacity: fadeIn ? .75 : 1 }}
      transition={{ duration: reduceMotion ? 0 : 1, delay: reduceMotion ? 0 : .15, ease: [.22, 1, .36, 1] }}
      aria-hidden="true"
      className={cn(
        "grid isolate overflow-hidden bg-[#07090a]",
        className,

      )}
      data-testid="warp-shader-panel"
    >
      <div
        className="[grid-area:1/1] h-full w-full opacity-100 saturate-[1.15]"
        data-testid="warp-shader-layer"
      >
        <Warp
          style={{ height: "100%", width: "100%" }}
          proportion={0.45}
          softness={1}
          distortion={0.25}
          swirl={0.8}
          swirlIterations={10}
          shape="checks"
          shapeScale={0.1}
          scale={1}
          rotation={0}
          speed={reduceMotion ? 0 : 0.65}
          colors={[
            "hsl(218, 100%, 20%)",
            "hsl(214, 100%, 75%)",
            "hsl(220, 90%, 30%)",
            "hsl(210, 100%, 80%)",
          ]}
        />
      </div>
      <div
        className="pointer-events-none [grid-area:1/1] bg-[#07090a]/35"
        data-testid="warp-shader-scrim"
      />
    </motion.div>
  );
}
