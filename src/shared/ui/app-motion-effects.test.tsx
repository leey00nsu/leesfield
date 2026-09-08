import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ controls: [] as { cancel: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn> }[] }));
vi.mock("motion", () => ({ animate: vi.fn(() => { const c = { cancel: vi.fn(), pause: vi.fn(), play: vi.fn() }; state.controls.push(c); return c; }) }));
import { installAppMotionEffects } from "./app-motion-effects";
afterEach(() => { document.body.replaceChildren(); state.controls.length = 0; });
it("animates inserted generation buttons, pauses disabled ones and cleans up", async () => {
  const dispose = installAppMotionEffects(document.body, false);
  const button = document.createElement('button'); button.dataset.generationAction = ''; button.disabled = true;
  document.body.append(button); await Promise.resolve();
  expect(state.controls).toHaveLength(1); expect(state.controls[0].pause).toHaveBeenCalled();
  button.disabled = false; await Promise.resolve(); expect(state.controls[0].play).toHaveBeenCalled();
  button.remove(); await Promise.resolve(); expect(state.controls[0].cancel).toHaveBeenCalled(); dispose();
});
it("renders reduced-motion effects without starting timelines", () => {
  const button = document.createElement('button'); button.dataset.generationAction = ''; document.body.append(button);
  const dispose = installAppMotionEffects(document.body, true);
  expect(state.controls).toHaveLength(0); expect(button.style.backgroundPosition).toContain('50%'); dispose();
});
