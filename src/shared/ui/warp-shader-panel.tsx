"use client";

import { useEffect, useState } from "react";
import { Warp } from "@paper-design/shaders-react";
import { hasClientShellHydrated } from "@/shared/lib/client-navigation-state";
import { cn } from "@/shared/lib/utils";

type WarpShaderPanelProps = {
  className?: string;
  fadeIn?: boolean;
  fadeInOnInitialLoadOnly?: boolean;
};

export function WarpShaderPanel({
  className,
  fadeIn = false,
  fadeInOnInitialLoadOnly = false,
}: WarpShaderPanelProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [shouldFadeIn] = useState(
    () => fadeIn && (!fadeInOnInitialLoadOnly || !hasClientShellHydrated()),
  );

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
    <div
      aria-hidden="true"
      className={cn(
        "grid isolate overflow-hidden bg-[#07090a]",
        className,
        shouldFadeIn &&
          "animate-in fade-in fill-mode-forwards opacity-75 delay-150 duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none",
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
            "hsl(200, 100%, 20%)",
            "hsl(160, 100%, 75%)",
            "hsl(180, 90%, 30%)",
            "hsl(170, 100%, 80%)",
          ]}
        />
      </div>
      <div
        className="pointer-events-none [grid-area:1/1] bg-[#07090a]/35"
        data-testid="warp-shader-scrim"
      />
    </div>
  );
}
