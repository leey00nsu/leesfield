import { act } from "@testing-library/react";
import { expect, test } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { nodeExecutionKeys } from "../hook/use-node-executions";
import type { NodeExecutionDto } from "../model/node-execution-types";
import { mountSpace, node, audioModel, llm } from "@/test-utils/space-browser";

const el = (selector: string) => { document.querySelector(selector)!.setAttribute("data-testid", selector); return page.getByTestId(selector); };
const dimensions = [390, 1440];
const audioEdge = (target: string) => ({ id: target, sourceNodeId: "audio", sourcePortId: "audio", targetNodeId: target, targetPortId: "audio", sortOrder: 0 });

test.each(dimensions)("B14/B16 real audio projects into Output/Gallery and fits after native resize at %ipx", async width => {
  await page.viewport(width, 844);
  const { session } = await mountSpace({ selected: "generation", nodes: [
    node("generation", "generate.audio", { prompt: "A short deterministic spoken tone", modelKey: audioModel.key, parameters: {} }),
    node("audio", "input.audio", { assetId: "audio" }, 440),
    node("output", "output.single", { mediaType: "audio" }, 880),
    node("gallery", "output.gallery", { mediaType: null }, 880, 440),
  ], edges: [audioEdge("output"), audioEdge("gallery")] });
  expect(document.querySelector('[data-space-node-id="generation"] audio, [data-space-node-id="generation"] canvas')).toBeNull();
  for (const id of ["audio", "output"]) {
    const player = document.querySelector<HTMLAudioElement>('[data-space-node-id="' + id + '"] audio');
    expect(player).not.toBeNull();
    await expect.poll(() => Boolean(player!.getAttribute("src"))).toBe(true);
    player!.load();
    await expect.poll(() => player!.readyState).toBeGreaterThanOrEqual(2);
    expect(player!.currentSrc).toBe(new URL("/assets/storybook/tone.wav", location.href).href);
  }
  await expect.element(el('[data-space-node-id="gallery"]').getByRole("button", { name: "View full size · Audio 1", exact: true })).toBeVisible();
  const source = session.getDocument();
  for (const id of ["generation", "audio"]) {
    await el('[data-space-node-id="' + id + '"] [data-space-node-header]').click();
    await commands.nativeDrag('[data-space-node-id="' + id + '"] .react-flow__resize-control.handle.bottom.right', -80, -80);
    const root = document.querySelector('[data-space-node-id="' + id + '"]')!;
    const box = root.getBoundingClientRect();
    const children = root.querySelectorAll("[data-app-prompt-editor],canvas,button[aria-label=Play]");
    expect(children.length).toBeGreaterThan(0);
    for (const control of children) {
      const b = control.getBoundingClientRect();
      expect(b.x - box.x).toBeGreaterThanOrEqual(-1); expect(b.y - box.y).toBeGreaterThanOrEqual(-1);
      expect(box.right - b.right).toBeGreaterThanOrEqual(-1); expect(box.bottom - b.bottom).toBeGreaterThanOrEqual(-1);
    }
  }
  expect(session.getDocument().nodes.find(item => item.id === "generation")!.config).toMatchObject({ prompt: "A short deterministic spoken tone" });
  expect(session.getDocument().edges).toEqual(source.edges);
});

test.each(dimensions)("B13 media chooser keyboard, cancel and body interaction boundaries at %ipx", async width => {
  await page.viewport(width, 844);
  const { session } = await mountSpace({ selected: "image", nodes: [node("image", "input.image", { assetId: null })] });
  const original = session.getDocument();
  const upload = page.getByRole("button", { name: "Upload", exact: true });
  (upload.element() as HTMLElement).focus();
  await userEvent.keyboard("{Escape}");
  await expect.element(el('[data-space-node-id="image"] [data-space-node-body]')).toHaveFocus();
  await expect.element(el('[data-space-node-id="image"]')).toHaveAttribute("data-body-interactive", "false");
  (upload.element() as HTMLElement).focus(); await userEvent.keyboard("{Tab}");
  await expect.element(page.getByRole("button", { name: "Assets", exact: true })).toHaveFocus();
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  await expect.element(upload).toHaveFocus();
  await commands.cancelFileChooser('[data-space-node-id="image"] ');
  expect(session.getDocument()).toBe(original);
  expect(document.querySelector("[data-space-media-chooser]")).toBeNull();
});

test.each(["edit.video.extractFrames", "generate.audio", "generate.video", "generate.assistant"] as const)(
  "B17 Korean %s keeps accessible ports, disabled Run and native resize", async kind => {
    await page.viewport(1440, 844);
    const titles = { "edit.video.extractFrames": "비디오 프레임 추출", "generate.audio": "오디오 생성",
      "generate.video": "비디오 생성", "generate.assistant": "AI 어시스턴트" };
    await mountSpace({ locale: "ko", selected: "custom", nodes: [node("custom", kind)] });
    await expect.element(el('[data-space-node-id="custom"] [data-space-node-header]')).toHaveTextContent(titles[kind]);
    const run = el('[data-space-node-id="custom"] [data-canvas-action="run"]');
    await expect.element(run).toBeDisabled();
    expect(run.element().getAttribute("aria-label")).toBeTruthy();
    const port = document.querySelector<HTMLElement>('[data-space-node-id="custom"] [data-space-port][data-visible="true"]')!;
    expect(port.getAttribute("role")).toBe("button"); expect(port.getAttribute("aria-label")).toBeTruthy();
    expect({ width: port.offsetWidth, height: port.offsetHeight }).toEqual({ width: 30, height: 30 });
    const card = document.querySelector('[data-space-node-id="custom"]')!;
    const before = card.getBoundingClientRect();
    await commands.nativeDrag('[data-space-node-id="custom"] .react-flow__resize-control.handle.bottom.right', 25, 25);
    await expect.poll(() => card.getBoundingClientRect().width).toBeGreaterThan(before.width + 15);
    await expect.poll(() => card.getBoundingClientRect().height).toBeGreaterThan(before.height + 15);
  });

test("B19 Assistant source/result tabs, real clipboard, fixed copy position and scrolling", async () => {
  await page.viewport(1440, 844);
  const outputText = Array.from({ length: 35 }, (_, index) => (index + 1) + ". A pink bandana and brown coat.").join("\n\n");
  const completed: NodeExecutionDto = { executionId: "assistant-run", executionKind: "assistant", mediaType: "text", graphNodeId: "assistant",
    status: "completed", progress: 100, modelKey: llm.key, outputText, outputAssetIds: [], errorCode: null,
    createdAt: "2026-10-20T00:00:00Z", finishedAt: "2026-10-20T00:00:01Z" };
  const { session, client } = await mountSpace({ locale: "ko", selected: "assistant", nodes: [
    node("image", "input.image", { assetId: "image-a" }),
    node("assistant", "generate.assistant", { prompt: "Describe both items in detail", modelKey: llm.key }, 460),
    node("frames", "edit.video.extractFrames", undefined, 0, 440),
  ], edges: [{ id: "reference", sourceNodeId: "image", sourcePortId: "image", targetNodeId: "assistant", targetPortId: "images", sortOrder: 0 }] });
  const card = el('[data-space-node-id="assistant"]');
  await expect.element(card.getByRole("tab", { name: "원본", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect.element(card.getByRole("img", { name: "이미지 참고자료 1", exact: true })).toBeVisible();
  expect(document.querySelectorAll('[data-space-node-id="frames"] [role=tablist]').length).toBe(0);
  await card.getByRole("tab", { name: "결과", exact: true }).click();
  await expect.element(card.getByRole("button", { name: "결과 복사", exact: true })).toBeDisabled();
  await card.getByRole("tab", { name: "원본", exact: true }).click();
  await card.getByRole("button", { name: "원본 복사", exact: true }).click();
  await expect.poll(() => navigator.clipboard.readText()).toBe("Describe both items in detail");
  await act(async () => {
    client.setQueryData(nodeExecutionKeys.list("component-space", "assistant"), [completed]);
    session.patchRuntime("assistant", { execution: completed });
  });
  await expect.element(card.getByRole("tab", { name: "결과", exact: true })).toHaveAttribute("aria-selected", "true");
  const copy = card.getByRole("button", { name: "결과 복사", exact: true }), panel = card.getByRole("tabpanel", { name: "결과", exact: true });
  await expect.element(panel).toHaveTextContent("pink bandana");
  const align = () => {
    const c = copy.element().getBoundingClientRect(), t = card.getByRole("tablist").element().getBoundingClientRect();
    const h = card.getByRole("tablist").element().parentElement!.getBoundingClientRect(), p = panel.element().getBoundingClientRect();
    expect(Math.abs(c.right - h.right)).toBeLessThan(2);
    expect(Math.abs(c.y + c.height / 2 - t.y - t.height / 2)).toBeLessThan(2); expect(c.bottom).toBeLessThanOrEqual(p.y);
  };
  align();
  await commands.nativeDrag('[data-space-node-id="assistant"] .react-flow__resize-control.handle.bottom.right', -100, -70);
  align();
  const before = copy.element().getBoundingClientRect().toJSON();
  panel.element().scrollTop = panel.element().scrollHeight;
  expect(panel.element().scrollTop).toBeGreaterThan(0);
  expect(copy.element().getBoundingClientRect().toJSON()).toEqual(before);
  (copy.element() as HTMLElement).focus(); await userEvent.keyboard("{Enter}");
  await expect.poll(() => navigator.clipboard.readText()).toBe(outputText);
  await expect.element(page.getByText("복사됨", { exact: true }).last()).toBeVisible();
  expect(card.getByText("복사됨", { exact: true }).query()).toBeNull();
});
