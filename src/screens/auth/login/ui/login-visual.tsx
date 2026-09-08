"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
const WarpShaderPanel = dynamic(() => import("@/shared/ui/warp-shader-panel").then(m => m.WarpShaderPanel), { ssr: false });
export function LoginVisual() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return desktop ? <WarpShaderPanel className="absolute inset-0 h-full w-full" /> : null;
}
