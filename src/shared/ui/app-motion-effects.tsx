"use client";
import { useEffect } from "react";
import { animate } from "motion";

// Covers host and vendored canvas buttons without changing their DOM/ref contracts.
const generation = '[data-generation-action], .node-banana-runtime__run-group > button:first-child, .spaces-canvas button[data-canvas-action="run"]';
const glass = '.landing-composer .generation-media-shell, .landing-composer [data-app-prompt-field][data-surface="hero"]';
const selector = generation + ', [data-app-skeleton], .lf-brand-gradient-text, [data-preview-gradient], ' + glass;
export function installAppMotionEffects(root: HTMLElement, reduced: boolean) {
  const active = new Map<HTMLElement, ReturnType<typeof animate>>();
  const register = (element: HTMLElement) => {
    if (active.has(element)) return;
    const isGlass = element.matches(glass);
    const isGeneration = element.matches(generation);
    const isText = element.matches('.lf-brand-gradient-text');
    if (reduced) {
      element.style[isGlass ? 'opacity' : 'backgroundPosition'] = isGlass ? '1' : isGeneration ? '0% 50%, 50% 50%' : '50% 50%';
      return;
    }
    const controls = isGlass
      ? animate(element, { opacity: [0, 1] }, { delay: .18, duration: .72, ease: [.22, 1, .36, 1] })
      : animate(element, { backgroundPosition: isGeneration ? ['0% 50%, 0% 50%', '0% 50%, 100% 50%'] : ['0% 50%', '100% 50%'] }, { duration: isText ? 1.5 : 3.5, ease: isText ? 'linear' : 'easeInOut', repeat: Infinity, repeatType: 'reverse' });
    active.set(element, controls);
    update(element);
  };
  const update = (element: HTMLElement) => {
    const controls = active.get(element);
    if (!controls || !element.matches(generation)) return;
    if (element.matches(':disabled, [aria-disabled="true"], [aria-busy="true"]')) controls.pause();
    else controls.play();
  };
  const scan = (element: Element) => {
    if (element instanceof HTMLElement && element.matches(selector)) register(element);
    element.querySelectorAll<HTMLElement>(selector).forEach(register);
  };
  scan(root);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof HTMLElement) update(record.target);
      for (const node of record.addedNodes) if (node instanceof Element) scan(node);
    }
    for (const [element, controls] of active) if (!root.contains(element)) {
      controls.cancel(); active.delete(element);
    }
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'aria-busy'] });
  return () => { observer.disconnect(); active.forEach(controls => controls.cancel()); };
}
export function AppMotionEffects() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let cleanup = installAppMotionEffects(document.body, media.matches);
    const change = () => { cleanup(); cleanup = installAppMotionEffects(document.body, media.matches); };
    media.addEventListener('change', change);
    return () => { cleanup(); media.removeEventListener('change', change); };
  }, []);
  return null;
}
