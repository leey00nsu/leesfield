"use client";
import { useEffect, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { useAnimate } from "motion/react";
import { useLandingReducedMotion } from "./use-landing-reduced-motion";
export const titleInitialStyle = { opacity: 0, filter: "blur(5px)", transform: "translateY(8px)" };
export function LandingTitleMotion({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const [scope, animate] = useAnimate<HTMLSpanElement>();
  const reduced = useLandingReducedMotion();
  useEffect(() => {
    const controls = animate(Array.from(scope.current.querySelectorAll<HTMLElement>('[data-title-step]')).map(element => [
      element,
      { opacity: [0, 1], filter: ['blur(5px)', 'blur(0px)'], transform: ['translateY(8px)', 'translateY(0px)'] },
      { at: reduced ? 0 : Number(element.dataset.titleStep) * .096, duration: reduced ? 0 : .72 },
    ]));
    return () => controls.cancel();
  }, [animate, reduced, scope, locale]);
  return <span aria-hidden="true" ref={scope}>{children}</span>;
}
