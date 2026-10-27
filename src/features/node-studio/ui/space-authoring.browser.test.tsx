import { expect, test } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { browserCatalog, mountSpace, node, imageModel, videoModel } from "@/test-utils/space-browser";
import { settledBounds } from "@/test-utils/browser-layout";

const dimensions = [390, 1440];
const el = (selector: string) => {
  const found = document.querySelectorAll(selector);
  expect(found.length, selector).toBe(1);
  found[0].setAttribute("data-testid", selector);
  return page.getByTestId(selector);
};
const body = (id: string) => el('[data-space-node-id="' + id + '"]');
const edge = (id: string, source: string, sourcePort: string, target: string, targetPort: string) => ({
  id, sourceNodeId: source, sourcePortId: sourcePort, targetNodeId: target, targetPortId: targetPort, sortOrder: 0, hasPause: false,
});
const focusCanvas = () => (document.querySelector("[data-space-canvas]") as HTMLElement).focus();
async function within(element: Element, width: number) {
  const box = await settledBounds(element);
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.right).toBeLessThanOrEqual(width + 1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.bottom).toBeLessThanOrEqual(845);
}

test.each(dimensions)("B01/B09 comments, settings drafts and dialog focus at %ipx", async width => {
  await page.viewport(width, 844);
  const { session } = await mountSpace({ header: true, nodes: [
    node("first", "input.prompt", { text: "first", presentation: { comment: "First review comment" } }),
    node("second", "input.prompt", { text: "second", presentation: { comment: "Second review comment" } }, 700, 100),
  ] });
  const original = session.getDocument();
  const comments = page.getByRole("button", { name: "Navigate comments" });
  await expect.element(comments).toHaveAttribute("title", "2 unviewed comments (2 total)");
  await comments.click();
  await expect.element(page.getByText("First review comment", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next comment", exact: true }).click();
  await expect.element(page.getByText("Second review comment", { exact: true })).toBeVisible();
  await expect.element(comments).toHaveAttribute("title", "0 unviewed comments (2 total)");
  await page.getByRole("button", { name: "Next comment", exact: true }).click();
  await expect.element(page.getByText("First review comment", { exact: true })).toBeVisible();
  expect(session.getDocument()).toBe(original);
  const settingsButton = page.getByRole("button", { name: "Space settings", exact: true });
  await settingsButton.click();
  const settings = page.getByRole("dialog", { name: "Space Settings", exact: true });
  await expect.element(settings).toBeVisible(); await within(settings.element(), width);
  await settings.getByRole("tab", { name: "Canvas", exact: true }).click();
  await settings.getByRole("radio", { name: "Middle Mouse", exact: true }).click();
  await settings.getByRole("tab", { name: "Space", exact: true }).click();
  await settings.getByRole("switch", { name: "Show model settings on nodes" }).click();
  await settings.getByRole("button", { name: "Save", exact: true }).click();
  await expect.element(settings).not.toBeInTheDocument();
  await settingsButton.click();
  await settings.getByRole("tab", { name: "Canvas", exact: true }).click();
  await expect.element(settings.getByRole("radio", { name: "Middle Mouse", exact: true })).toHaveAttribute("aria-checked", "true");
  await userEvent.keyboard("{Escape}");
  await expect.element(settingsButton).toHaveFocus();
  await page.getByRole("button", { name: "All nodes", exact: true }).click();
  await within(el("[data-space-node-menu]").element(), width);
  await userEvent.keyboard("{Escape}");
  await page.getByRole("button", { name: "All models", exact: true }).click();
  const models = page.getByRole("dialog", { name: "All models", exact: true });
  await expect.element(models).toBeVisible(); await within(models.element(), width);
  await userEvent.keyboard("{Escape}");
  await expect.element(models).not.toBeInTheDocument();
});

test.each(dimensions)("B02 native icon handles, aliases and canonical connection at %ipx", async width => {
  await page.viewport(width, 844);
  const { session } = await mountSpace({ selected: "source", nodes: [
    node("source", "input.image", { assetId: null }),
    node("target", "input.image", { assetId: null }, 500, 100),
    node("generator", "generate.image", { modelKey: imageModel.key, prompt: "", parameters: {} }, 1000, 400),
  ] });
  const source = el('[data-space-node-id="source"] .source[data-space-port="image"][data-visible="true"]');
  await expect.element(source).toHaveAttribute("title", "Image");
  await source.click(); await expect.element(el("[data-space-node-menu]")).toBeVisible();
  await userEvent.keyboard("{Escape}");
  (source.element() as HTMLElement).focus(); await userEvent.keyboard("{Enter}");
  await expect.element(el("[data-space-node-menu]")).toBeVisible(); await userEvent.keyboard("{Escape}");
  await commands.nativeConnect('[data-space-node-id="source"] .source[data-space-port="image"][data-visible="true"]',
    '[data-space-node-id="target"] .target[data-space-port="reference"][data-visible="true"]');
  await expect.poll(() => session.getDocument().edges.length).toBe(1);
  expect(session.getDocument().edges[0]).toMatchObject({ sourceNodeId: "source", sourcePortId: "image", targetNodeId: "target", targetPortId: "reference" });
  await expect.element(source).toHaveAttribute("data-connected", "true");
  const aliases = document.querySelectorAll('[data-space-node-id="generator"] [data-space-port][data-visible="false"]');
  expect(aliases.length).toBeGreaterThan(0);
  for (const alias of aliases) expect(getComputedStyle(alias).pointerEvents).toBe("none");
  await commands.nativeConnect('[data-space-node-id="source"] .source[data-space-port="image"][data-visible="true"]',
    '[data-space-node-id="generator"] .target[data-value-type="image"][data-visible="true"]');
  await expect.poll(() => session.getDocument().edges.some(item => item.targetNodeId === "generator")).toBe(true);
});

test.each(["en", "ko"] as const)("B03/B04 missing and incompatible models use one public toast (%s)", async locale => {
  await page.viewport(390, 844);
  const catalog = { ...browserCatalog, imageModels: [], audioModels: [], videoModels: [] };
  const { session } = await mountSpace({ locale, catalog, nodes: [node("source", "input.image", { assetId: null })] });
  const original = session.getDocument();
  for (const [key, type, korean] of [["g", "image", "이미지"], ["v", "video", "비디오"], ["t", "audio", "오디오"]]) {
    focusCanvas(); await userEvent.keyboard("{Shift>}" + key + "{/Shift}");
    const toast = el('[data-sonner-toast][data-type="error"]');
    await expect.element(toast).toHaveTextContent(locale === "ko" ? korean + " 모델이 없습니다" : "There are no " + type + " models");
    await expect.element(toast).toHaveAttribute("data-mounted", "true"); await expect.poll(() => toast.element().getBoundingClientRect().y).toBeGreaterThanOrEqual(0); await within(toast.element(), 390);
    expect(document.querySelector("[data-space-canvas] > [role=alert]")).toBeNull();
    await el('[data-sonner-toast] button[data-close-button]').click();
    await expect.poll(() => document.querySelectorAll("[data-sonner-toast]").length).toBe(0);
    expect(session.getDocument()).toBe(original);
  }
  await el('[data-space-node-id="source"] .source[data-space-port="image"][data-visible="true"]').click();
  await page.getByRole("option", { name: locale === "ko" ? "비디오 생성" : "Generate Video", exact: true }).click();
  await expect.element(el('[data-sonner-toast][data-type="error"]')).toHaveTextContent(locale === "ko" ? "비디오 모델이 없습니다" : "There are no video models");
  expect(session.getDocument()).toBe(original);
});

test.each(dimensions)("B05 palette creates all fourteen supported kinds without retired entries at %ipx", async width => {
  await page.viewport(width, 844);
  const { session } = await mountSpace({ nodes: [] });
  const cases = [
    ["Prompt Constructor", "process.promptConstructor"], ["Image Input", "input.image"], ["Audio Input", "input.audio"],
    ["Video Input", "input.video"], ["Prompt", "input.prompt"], ["Generate Image", "generate.image"], ["Generate Audio", "generate.audio"],
    ["Generate Video", "generate.video"], ["AI Assistant", "generate.assistant"], ["Video Frames", "edit.video.extractFrames"],
    ["Memo", "note.memo"], ["Output", "output.single"], ["Output Gallery", "output.gallery"], ["Image Compare", "inspect.imageCompare"],
  ];
  await page.getByRole("button", { name: "All nodes", exact: true }).click();
  for (const label of ["Audio Edit", "Annotation", "Remove Background", "Split Grid", "GIF Encoder", "Frame Grab", "Ease Curve", "Image Resize", "Video Trim", "Video Stitch"])
    expect(page.getByRole("option", { name: label, exact: true }).query()).toBeNull();
  await userEvent.keyboard("{Escape}");
  for (const [label] of cases) {
    await page.getByRole("button", { name: "All nodes", exact: true }).click();
    await page.getByRole("option", { name: label, exact: true }).click();
  }
  expect(session.getDocument().nodes.map(item => item.kind).sort()).toEqual(cases.map(item => item[1]).sort());
  expect(document.querySelectorAll(".react-flow__node").length).toBe(14);
  for (const item of session.getDocument().nodes) expect(document.querySelector('[data-space-node-id="' + item.id + '"] [data-space-node-body]')).not.toBeNull();
});

test.each(dimensions)("B06 Memo native resize, undo/redo and color at %ipx", async width => {
  await page.viewport(width, 844);
  const { session } = await mountSpace({ selected: "memo", nodes: [node("memo", "note.memo", { text: "Resizable note" })] });
  const card = body("memo").element(), editor = page.getByRole("textbox", { name: "Memo", exact: true });
  const initial = card.getBoundingClientRect();
  expect(getComputedStyle(el('[data-space-node-id="memo"] .react-flow__resize-control.handle.bottom.right').element()).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  await commands.nativeDrag('[data-space-node-id="memo"] .react-flow__resize-control.handle.bottom.right', 140, 90);
  await expect.poll(() => card.getBoundingClientRect().width).toBeGreaterThan(initial.width + 100);
  const resized = structuredClone(session.getDocument().nodes[0].config);
  focusCanvas(); await userEvent.keyboard("{ControlOrMeta>}z{/ControlOrMeta}");
  await expect.poll(() => card.getBoundingClientRect().width).toBeLessThan(initial.width + 5);
  await userEvent.keyboard("{ControlOrMeta>}{Shift>}z{/Shift}{/ControlOrMeta}");
  expect(session.getDocument().nodes[0].config).toEqual(resized);
  await expect.element(editor).toHaveValue("Resizable note");
  const color = page.getByRole("region", { name: "Memo settings", exact: true }).getByLabelText("Background color", { exact: true }).element() as HTMLInputElement;
  // The native OS picker reports input/change; it is outside page automation.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(color, "#f2d86b");
  color.dispatchEvent(new Event("input", { bubbles: true })); color.dispatchEvent(new Event("change", { bubbles: true }));
  await expect.poll(() => (session.getDocument().nodes[0].config as { backgroundColor?: string }).backgroundColor).toBe("#f2d86b");
  focusCanvas(); await userEvent.keyboard("{ControlOrMeta>}z{/ControlOrMeta}");
  expect(session.getDocument().nodes[0].config).toEqual(resized);
  await userEvent.keyboard("{ControlOrMeta>}{Shift>}z{/Shift}{/ControlOrMeta}");
  expect((session.getDocument().nodes[0].config as { backgroundColor?: string }).backgroundColor).toBe("#f2d86b");
});

test.each(dimensions)("B07 menus close outside, exclude each other and restore focus at %ipx", async width => {
  await page.viewport(width, 844); await mountSpace({ nodes: [] });
  const generate = page.getByRole("button", { name: "Generate", exact: true }), all = page.getByRole("button", { name: "All nodes", exact: true });
  await generate.click(); await expect.element(generate).toHaveAttribute("aria-expanded", "true");
  await el(".react-flow__pane").click({ position: { x: 8, y: 8 } });
  await expect.element(generate).toHaveAttribute("aria-expanded", "false");
  await all.click(); await el(".react-flow__pane").click({ position: { x: 8, y: 8 } });
  expect(document.querySelector("[data-space-node-menu]")).toBeNull();
  await generate.click(); await all.click();
  await expect.element(generate).toHaveAttribute("aria-expanded", "false");
  await userEvent.keyboard("{Escape}");
  await expect.element(all).toHaveFocus();
});

test.each(dimensions)("B08 edge toolbar bounds, pause, resume and delete at %ipx", async width => {
  await page.viewport(width, 844);
  const { session } = await mountSpace({ nodes: [node("source", "input.image", { assetId: null }), node("target", "inspect.imageCompare", {}, 460, 240)],
    edges: [edge("wire", "source", "image", "target", "before")] });
  await el(".react-flow__edge-interaction").click({ force: true });
  const toolbar = page.getByRole("toolbar", { name: "Selected edge", exact: true });
  await expect.element(toolbar).toBeVisible(); await within(toolbar.element(), width);
  await toolbar.getByRole("button", { name: "Add pause", exact: true }).click();
  expect(session.getDocument().edges[0].hasPause).toBe(true);
  await toolbar.getByRole("button", { name: "Remove pause", exact: true }).click();
  expect(session.getDocument().edges[0].hasPause).toBe(false);
  await toolbar.getByRole("button", { name: "Delete edge", exact: true }).click();
  expect(session.getDocument().edges).toEqual([]);
  await expect.element(toolbar).not.toBeInTheDocument();
});

test.each(["en", "ko"] as const)("B04 incompatible video input uses a public toast and leaves the graph untouched (%s)", async locale => {
  await page.viewport(390, 844);
  const unsupported = { ...videoModel, meta: { ...videoModel.meta, supports_init_image: false }, parameters: {},
    providerConfig: { ...videoModel.providerConfig, gradio_contract: undefined } };
  const { session } = await mountSpace({ locale, catalog: { ...browserCatalog, videoModels: [unsupported] },
    nodes: [node("source", "input.image", { assetId: null })] });
  const original = session.getDocument();
  await el('[data-space-node-id="source"] .source[data-space-port="image"][data-visible="true"]').click();
  await page.getByRole("option", { name: locale === "ko" ? "비디오 생성" : "Generate Video", exact: true }).click();
  await expect.element(el('[data-sonner-toast][data-type="error"]')).toHaveTextContent(locale === "ko"
    ? "이 입력을 받을 수 있는 모델이 없습니다" : "There are no models that can accept this input");
  expect(session.getDocument()).toBe(original);
});
