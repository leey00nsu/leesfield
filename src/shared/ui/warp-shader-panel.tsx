"use client";

import { useEffect, useState } from "react";
import { Warp } from "@paper-design/shaders-react";

type WarpShaderPanelProps = {
  className?: string;
};

export function WarpShaderPanel({ className }: WarpShaderPanelProps) {
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
    <div className={className} aria-hidden="true">
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
  );
}
