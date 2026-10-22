"use client";

/* Tutorial copy adapted from Node Banana. MIT License.
 * Copyright (c) 2026 William Falloon
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";
import type { GenerationGraphEdgeDto, GenerationGraphNodeDto } from "../model/graph-types";
import styles from "./space-tutorial.module.css";

type TutorialState = { nodes: readonly GenerationGraphNodeDto[]; edges: readonly GenerationGraphEdgeDto[]; menuOpened: boolean };
type TutorialStep = { message: string; selector?: string; auto?: boolean; complete?: (state: TutorialState) => boolean };
const steps: readonly TutorialStep[] = [
  { message: "Let's go over the basics.", auto: true },
  { message: "Click the Image button to add an image node.", selector: '[data-tutorial="image-button"]', complete: state => state.nodes.some(node => node.kind === "input.image") },
  { message: "This is a node. Each node has a specific function.\n\nThis node adds images.", selector: '[data-space-node="input.image"]' },
  { message: "Inputs always go in on the left side of the node.", selector: '[data-space-node="input.image"] .target[data-visible="true"]' },
  { message: "Outputs always come from the right side of the node.", selector: '[data-space-node="input.image"] .source[data-visible="true"]' },
  { message: "Now drag from the output handle and drop into empty space.", selector: '[data-space-node="input.image"] .source[data-visible="true"]', complete: state => state.menuOpened },
  { message: "This menu will show all available connections for the node.\n\nSelect 'Generate Image' to add an AI image generation node.", selector: '[data-space-node-menu]', complete: state => state.nodes.some(node => node.kind === "generate.image") },
  { message: "Click the Prompt button to add a prompt node.", selector: '[data-tutorial="prompt-button"]', complete: state => state.nodes.some(node => node.kind === "input.prompt") },
  { message: "Drag from the Prompt's output handle to the Generate Image's input handle.", selector: '[data-space-node="input.prompt"] .source[data-visible="true"]', complete: state => state.edges.some(edge =>
    state.nodes.some(node => node.id === edge.sourceNodeId && node.kind === "input.prompt") &&
    state.nodes.some(node => node.id === edge.targetNodeId && node.kind === "generate.image") && edge.targetPortId === "prompt") },
  { message: "This is the Generate Image node. It uses AI to create or modify images based on your prompt and reference image.", selector: '[data-space-node="generate.image"]' },
  { message: "Choose a model, upload your image and write a prompt. Run the Generate Image node when you are ready.", selector: '[data-space-node="generate.image"] [data-canvas-action="run"]' },
  { message: "Run your Generate Image node to create an image. You can skip the tutorial at any time.", selector: '[data-space-node="generate.image"] [data-canvas-action="run"]', complete: state => state.nodes.some(node => node.kind === "generate.image" && Boolean(node.selectedOutputAssetId)) },
  { message: "Connect more nodes downstream to build generative pipelines, or just use it as an infinite creative canvas." },
  { message: "Your Space saves automatically. Use Save to check that the latest changes reached the server.", selector: '[data-tutorial="save-button"]' },
  { message: "You're all set! Happy creating.", auto: true },
];

/** A read-only guide: progress observes canonical edits; it never submits a generation. */
export function SpaceTutorial({ nodes, edges, onClose }: { nodes: readonly GenerationGraphNodeDto[]; edges: readonly GenerationGraphEdgeDto[]; onClose: () => void }) {
  const tc = useCanvasTranslation();
  const [index, setIndex] = useState(0), [menuOpened, setMenuOpened] = useState(false);
  const [anchor, setAnchor] = useState<{ selector: string; x: number; y: number; width: number; height: number } | null>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  const step = steps[index];
  useEffect(() => {
    const detect = () => { if (document.querySelector("[data-space-node-menu]")) setMenuOpened(true); };
    detect();
    const observer = new MutationObserver(detect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  const completed = step.complete?.({ nodes, edges, menuOpened }) === true;
  useEffect(() => {
    if (!step.auto) return;
    const timer = setTimeout(() => index === steps.length - 1 ? close.current() : setIndex(previous => previous + 1), 3_000);
    return () => clearTimeout(timer);
  }, [index, step.auto]);
  useEffect(() => {
    if (!completed) return;
    const timer = setTimeout(() => setIndex(previous => Math.min(previous + 1, steps.length - 1)), 1_000);
    return () => clearTimeout(timer);
  }, [index, completed]);
  useEffect(() => {
    if (!step.selector) return;
    let frame: number;
    const update = () => {
      const rect = document.querySelector(step.selector!)?.getBoundingClientRect();
      const next = rect && rect.width && rect.height ? { selector: step.selector!, x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
      setAnchor(previous => previous?.selector === next?.selector && previous?.x === next?.x && previous?.y === next?.y && previous?.width === next?.width && previous?.height === next?.height ? previous : next);
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [step.selector]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
        document.querySelector('[role="dialog"],[role="alertdialog"]') ||
        (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"]'))) return;
      event.preventDefault(); close.current();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(<>
    {anchor && anchor.selector === step.selector && <div aria-hidden="true" className={styles.highlight} style={{ left: anchor.x - 6, top: anchor.y - 6, width: anchor.width + 12, height: anchor.height + 12 }} />}
    <section aria-label={tc("Tutorial")} className={styles.message} data-space-tutorial=""
      onPointerDown={event => event.stopPropagation()} onKeyDown={event => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing && event.keyCode !== 229 &&
          !document.querySelector('[role="dialog"],[role="alertdialog"]')) { event.preventDefault(); close.current(); }
        event.stopPropagation();
      }}>
      <div className={styles.heading}><strong>{tc("Tutorial")}</strong><span>{index + 1}/{steps.length}</span></div>
      <p aria-live="polite">{tc(step.message)}</p>
      <div className={styles.actions}>
        <button type="button" onClick={() => close.current()}>{tc("Skip tutorial")}</button>
        {index > 0 && <button type="button" onClick={() => setIndex(previous => previous - 1)}>{tc("Back")}</button>}
        {!step.complete && <button type="button" className={styles.primary} onClick={() => index === steps.length - 1 ? close.current() : setIndex(previous => previous + 1)}>{tc(index === steps.length - 1 ? "Done" : "Continue")}</button>}
      </div>
    </section>
  </>, document.body);
}
