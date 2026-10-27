import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { AppAudioPlayer } from "@/shared/ui/app-audio-player";
import { intl, mountSpace, node, imageModel, audioModel, videoModel } from "@/test-utils/space-browser";

const dimensions = [390, 1440] as const;
const media = [imageModel, audioModel, videoModel] as const;
const heightCases = dimensions.flatMap(width => media.flatMap(model => [0, 1, 2].map(repeat => ({ width, model, repeat }))));

function sampleHeights(element: HTMLElement, duration = 600) {
  return new Promise<number[]>(resolve => {
    const heights: number[] = [], started = performance.now();
    const tick = () => {
      heights.push(element.offsetHeight);
      if (performance.now() - started >= duration) resolve(heights); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

test.each(heightCases)("B12 real settings body stays stable: $width $model.type repeat $repeat", async ({ width, model, repeat }) => {
  await page.viewport(width, 844);
  const { session } = await mountSpace({ inline: true, selected: "generation", nodes: [node("generation", `generate.${model.type}`,
    { prompt: "Keep the source body", modelKey: model.key, parameters: {} })] });
  const body = document.querySelector<HTMLElement>('[data-space-node-id="generation"]')!;
  const source = body.querySelector<HTMLElement>("[data-space-node-body]")!;
  const before = session.getDocument(), original = source.offsetHeight;
  const toggle = page.getByRole("button", { name: "Settings", exact: true });
  (toggle.element() as HTMLElement).focus();
  for (const open of [true, false]) {
    const sampling = sampleHeights(source);
    if (open) await toggle.click();
    else { (toggle.element() as HTMLElement).focus(); await userEvent.keyboard("{Enter}"); }
    await expect.element(toggle).toHaveAttribute("aria-expanded", String(open));
    const heights = await sampling;
    expect(heights.length).toBeGreaterThan(3);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2);
    expect(source.offsetHeight).toBe(original);
    if (open) {
      const a = source.getBoundingClientRect(), b = body.querySelector<HTMLElement>("[data-space-node-settings]")!.getBoundingClientRect();
      expect(b.y).toBeGreaterThanOrEqual(a.bottom - 2);
    }
  }
  expect(session.getDocument()).toBe(before);
  const collapsed = body.getBoundingClientRect();
  (toggle.element() as HTMLElement).focus(); await userEvent.keyboard("{Enter}");
  if (repeat) await new Promise(resolve => setTimeout(resolve, repeat * 50));
  await userEvent.keyboard("{Enter}");
  await expect.element(toggle).toHaveAttribute("aria-expanded", "false");
  expect(Math.abs(body.getBoundingClientRect().height - collapsed.height)).toBeLessThan(2);
  const beforeResize = body.getBoundingClientRect().width;
  await commands.nativeDrag('[data-space-node-id="generation"] .react-flow__resize-control.handle.bottom.right', 24, 24);
  await expect.poll(() => body.getBoundingClientRect().width).toBeGreaterThan(beforeResize + 10);
});

test.each(dimensions)("B15 Compare decodes distinct sides and keeps native slider local at %ipx", async width => {
  await page.viewport(width, 844);
  const { session, assets } = await mountSpace({ nodes: [node("a", "input.image", { assetId: "image-a" }),
    node("b", "input.image", { assetId: "image-b" }, 0, 350), node("compare", "inspect.imageCompare", {}, 500)], edges: [
      { id: "before", sourceNodeId: "a", sourcePortId: "image", targetNodeId: "compare", targetPortId: "before", sortOrder: 0 },
      { id: "after", sourceNodeId: "b", sourcePortId: "image", targetNodeId: "compare", targetPortId: "after", sortOrder: 0 },
    ] });
  const before = session.getDocument();
  for (const [index, label] of ["Image A", "Image B"].entries()) {
    const image = page.getByRole("img", { name: label, exact: true });
    await expect.element(image).toBeVisible();
    await expect.poll(() => { const el = image.element() as HTMLImageElement; return el.complete && el.naturalWidth > 0; }).toBe(true);
    expect((image.element() as HTMLImageElement).src).toBe(new URL(assets[index].url, location.href).href);
  }
  const slider = page.getByRole("slider", { name: "Image Compare", exact: true });
  const value = Number(slider.element().getAttribute("aria-valuenow"));
  (slider.element() as HTMLElement).focus(); await userEvent.keyboard("{ArrowRight}");
  await expect.poll(() => Number(slider.element().getAttribute("aria-valuenow"))).toBeGreaterThan(value);
  await userEvent.keyboard("{ArrowLeft}");
  await expect.poll(() => Number(slider.element().getAttribute("aria-valuenow"))).toBe(value);
  expect(session.getDocument()).toBe(before);
});

test.each(dimensions)("B16 real audio decoding, seek, speed, volume and keyboard stay in the player at %ipx", async width => {
  await page.viewport(width, 844);
  render(intl(<AppAudioPlayer src="/assets/storybook/tone.wav" preload="metadata" />));
  const audio = document.querySelector("audio")!;
  await expect.poll(() => audio.readyState).toBeGreaterThanOrEqual(2);
  const playbackEvents = new AbortController();
  // Latch real progress before the click. A short clip can end and reset to
  // zero between automation samples, and audio device startup is asynchronous.
  const advanced = new Promise<number>((resolve, reject) => {
    audio.addEventListener("timeupdate", () => { if (audio.currentTime > .1) resolve(audio.currentTime); }, { signal: playbackEvents.signal });
    audio.addEventListener("error", () => reject(new Error("Native audio playback failed")), { signal: playbackEvents.signal });
  });
  try {
    await page.getByRole("button", { name: "Play", exact: true }).click();
    expect(await advanced).toBeGreaterThan(.1);
  } finally { playbackEvents.abort(); }
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  expect(audio.paused).toBe(true);
  await page.getByRole("button", { name: "Playback speed: 1×", exact: true }).click();
  await page.getByRole("radio", { name: "2×", exact: true }).click();
  expect(audio.playbackRate).toBe(2); expect(audio.defaultPlaybackRate).toBe(2);
  await userEvent.keyboard("{Escape}");
  await page.getByRole("button", { name: "Volume", exact: true }).click();
  const volume = page.getByRole("slider", { name: "Volume", exact: true });
  (volume.element() as HTMLElement).focus(); await userEvent.keyboard("{Home}");
  expect(audio.volume).toBe(0); expect(audio.muted).toBe(true);
  await userEvent.keyboard("{End}"); expect(audio.volume).toBe(1); expect(audio.muted).toBe(false);
  await userEvent.keyboard("{Escape}");
  const position = page.getByRole("slider", { name: "Playback position", exact: true });
  (position.element() as HTMLElement).focus(); await userEvent.keyboard("{End}");
  await expect.poll(() => audio.currentTime).toBeGreaterThan(.5);
});
