import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { deflateSync } from "node:zlib";

import { test, expect } from "./spaces-test-fixtures.mjs";
import { storageRead } from "./storage-route.mjs";
import { createUploadPacer } from "../upload-pacing.mjs";

const WORKFLOW_PATH = "/spaces";
const E2E_TITLE_PREFIX = "Spaces Chromium";

const CANONICAL_NODE_CASES = [
  { kind: "process.promptConstructor", palette: "Prompt Constructor", title: "Prompt Constructor", config: { template: "" } },
  { kind: "input.image", palette: "Image Input", title: "Image Input", config: { assetId: null } },
  { kind: "input.audio", palette: "Audio Input", title: "Audio Input", config: { assetId: null } },
  { kind: "input.video", palette: "Video Input", title: "Video Input", config: { assetId: null } },
  { kind: "input.prompt", palette: "Prompt", title: "Prompt", config: { text: "" } },
  { kind: "generate.image", palette: "Generate Image", title: "Generate Image", config: { prompt: "", modelKey: null, parameters: {} } },
  { kind: "generate.audio", palette: "Generate Audio", title: "Generate Audio", config: { prompt: "", modelKey: null, parameters: {} } },
  { kind: "generate.video", palette: "Generate Video", title: "Generate Video", config: { prompt: "", modelKey: null, parameters: {} } },
  { kind: "generate.assistant", palette: "AI Assistant", title: "AI Assistant", config: { prompt: "", modelKey: null } },
  { kind: "edit.video.extractFrames", palette: "Video Frames", title: "Video Frames", config: { parameters: {} } },
  { kind: "note.memo", palette: "Memo", title: "Memo", config: { text: "" } },
  { kind: "edit.image.resize", palette: "Image Resize", title: "Image Resize", config: { parameters: {} } },
  { kind: "edit.video.stitch", palette: "Video Stitch", title: "Video Stitch", config: { parameters: {} } },
  { kind: "edit.video.trim", palette: "Video Trim", title: "Video Trim", config: { parameters: {} } },
  { kind: "output.single", palette: "Output", title: "Output", config: { mediaType: null } },
  { kind: "output.gallery", palette: "Output Gallery", title: "Output Gallery", config: { mediaType: null } },
  { kind: "inspect.imageCompare", palette: "Image Compare", title: "Image Compare", config: {} },
];

function crc32(value) {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBytes, data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function deterministicPng(width = 32, height = 24, variant = 0) {
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 4);
    scanlines[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4;
      const checker = (x + y + variant) % 2 === 0;
      scanlines[offset] = checker ? 235 - variant * 35 : 24 + variant * 20;
      scanlines[offset + 1] = checker ? 82 + variant * 40 : 160 - variant * 30;
      scanlines[offset + 2] = checker ? 45 + variant * 65 : 210 - variant * 40;
      scanlines[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function deterministicWav(durationSeconds = 1, sampleRate = 8_000) {
  const sampleCount = Math.round(durationSeconds * sampleRate);
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.round(Math.sin((index / sampleRate) * Math.PI * 2 * 440) * 8_000);
    buffer.writeInt16LE(sample, 44 + index * 2);
  }
  return buffer;
}

function isConsoleError(message) {
  return message.type() === "error";
}

async function waitForCanvas(page, graphId, navigate = true) {
  // A cold Turbopack editor compile was measured at37s; list readiness does not
  // warm this route. Keep interaction assertions tight, allow initial compile.
  if (navigate) await page.goto(`${WORKFLOW_PATH}/${encodeURIComponent(graphId)}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  // Next.js dev tools mount a full-viewport shadow host even when no runtime
  // error exists. Keep the product surface pointer-testable in dev-server E2E;
  // console/page errors are captured independently by attachErrorCapture.
  await page.addStyleTag({ content: "nextjs-portal { pointer-events: none !important; }" });
  await expect(page.locator('[data-space-canvas]')).toBeVisible({ timeout: 60_000 });
  // This existing control becomes enabled only after preferences and catalog
  // state have committed. A network entry can belong to an aborted Strict Mode
  // read, so observe the application state instead.
  await page.getByRole("button", { name: /^(Space settings|스페이스 설정)$/ }).click();
  const settings = page.getByRole("dialog", { name: /^(Space Settings|스페이스 설정)$/ });
  await expect(settings.getByRole("switch", { name: /^(Show model settings on nodes|노드에 모델 설정 표시)$/ })).toBeEnabled();
  await settings.getByRole("button", { name: /^(Cancel|취소)$/ }).click();
  await expect(settings).toBeHidden();
}

async function expectPlayableVideo(video, assetId, playbackMode = "hover") {
  const page = video.page();
  const pane = page.locator(".react-flow__pane");
  await pane.click({ position: { x: 8, y: 8 } });
  const node = video.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' react-flow__node ')][1]");
  await expect(node).not.toHaveClass(/selected/);
  // Hover is the playback gesture. Clicking a scaled preview can
  // hit its native pause control or the Trim Source/Trimmed toggle.
  // Movement mode keeps the pointer on the node body; the video receives the
  // same node hover policy without taking control before an explicit click.
  await node.locator('[data-space-node-body]').hover();
  if (assetId) {
    const expectedDigest = await mediaAssetDigest(video.page(), assetId);
    await expect.poll(async () => {
      const current = await video.evaluate((element) => ({ src: element.currentSrc, ready: element.readyState >= 2 }));
      if (!current.src || !current.ready) return null;
      const response = await storageRead(page.request, current.src);
      if (!response.ok()) return null;
      const digest = createHash("sha256").update(await response.body()).digest("hex");
      return (await video.evaluate((element) => element.currentSrc)) === current.src ? digest : null;
    }, { timeout: 30_000, message: "Preview must decode the durable output, not its previous input" }).toBe(expectedDigest);
  }
  await expect.poll(() => video.evaluate((element) => ({
    ready: element.readyState >= 2,
    width: element.videoWidth,
    error: element.error?.message ?? null,
  })), { timeout: 15_000, message: "Video source must finish loading before playback" }).toMatchObject({ ready: true, error: null });
  const source = await video.evaluate((element) => element.currentSrc);
  if (playbackMode === "manual") {
    await video.evaluate(async (element) => {
      element.muted = true;
      await element.play();
    });
  }
  await expect.poll(() => video.evaluate((element) => ({
    decoded: element.readyState >= 2 && element.videoWidth > 0 && element.videoHeight > 0,
    durationValid: Number.isFinite(element.duration) && element.duration > 0,
    advanced: element.currentTime > 0.05,
    paused: element.paused,
    error: element.error?.message ?? null,
  })), { timeout: 15_000, message: "Video must decode a frame and advance playback" }).toMatchObject({ decoded: true, durationValid: true, advanced: true, paused: false, error: null });
  await expect(video).toHaveJSProperty("currentSrc", source);
  const probe = await video.evaluate((element) => ({ duration: element.duration, width: element.videoWidth, height: element.videoHeight }));
  await pane.hover({ position: { x: 8, y: 8 } });
  if (playbackMode === "manual") await video.evaluate((element) => element.pause());
  await expect(video).toHaveJSProperty("paused", true);
  return probe;
}

async function createWorkflowViaApi(page, title = `${E2E_TITLE_PREFIX} ${randomUUID()}`) {
  const response = await page.request.post("/api/generation-graphs", { data: { title } });
  expect(response.ok(), `create graph failed: ${response.status()} ${await response.text()}`).toBeTruthy();
  const payload = await response.json();
  return { id: payload.graph.id, title: payload.graph.title };
}

async function deleteWorkflowViaApi(page, graphId) {
  if (!graphId) return;
  const response = await page.request.delete(`/api/generation-graphs/${encodeURIComponent(graphId)}`);
  if (!response.ok() && response.status() !== 404) {
    throw new Error(`delete graph failed: ${response.status()} ${await response.text()}`);
  }
}

async function waitForFreshWorkflow(page, graph, navigate = true) {
  await waitForCanvas(page, graph.id, navigate);
  const workflowName = page.locator('[data-space-workspace-header]').getByText(graph.title, { exact: true });
  if (!(await workflowName.isVisible())) {
    // The editor opens the newest workflow, but another test/browser can create
    // a newer graph between our API POST and the route load. Select this graph
    // through the real hosted workflow browser instead of relying on list order.
    await page.getByRole("button", { name: "Open space" }).click();
    const menu = page.getByRole("dialog", { name: "Spaces", exact: true });
    await expect(menu.getByRole("option", { name: graph.title, exact: true })).toBeVisible({ timeout: 15_000 });
    await menu.getByRole("option", { name: graph.title, exact: true }).click();
  }
  await expect(workflowName).toBeVisible({ timeout: 15_000 });
}

async function readWorkflowViaApi(page, graphId) {
  // Retry only connection resets on this idempotent read; HTTP errors still fail below.
  const response = await page.request.get(`/api/generation-graphs/${encodeURIComponent(graphId)}`, { maxRetries: 2 });
  if (!response.ok()) throw new Error(`read graph failed: ${response.status()} ${await response.text()}`);
  return (await response.json()).graph;
}

async function replaceWorkflowViaApi(page, graphId, nodes, edges = []) {
  const current = await readWorkflowViaApi(page, graphId);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const response = await page.request.put(`/api/generation-graphs/${encodeURIComponent(graphId)}`, {
    data: {
      schemaVersion: 3, groups: current.groups.map((group) => ({ ...group,
        memberNodeIds: group.memberNodeIds.filter((id) => nodeIds.has(id)),
      })),
      expectedVersion: current.version,
      title: current.title,
      nodes,
      edges,
    },
  });
  expect(response.ok(), `replace graph failed: ${response.status()} ${await response.text()}`).toBeTruthy();
  return (await response.json()).graph;
}

async function waitForWorkflowState(page, graphId, predicate, message, timeout = 30_000) {
  let latest = null;
  try {
    await expect.poll(
      async () => {
        latest = await readWorkflowViaApi(page, graphId);
        return predicate(latest);
      },
      { timeout, intervals: [250, 500, 1_000, 2_000], message },
    ).toBeTruthy();
  } catch (error) {
    throw new Error(`${message}; latest graph=${JSON.stringify(latest)}`, { cause: error });
  }
  return readWorkflowViaApi(page, graphId);
}

async function activeModel(page, type, predicate = () => true) {
  const response = await page.request.get("/api/models");
  expect(response.ok(), "The isolated fixture model catalog must be available").toBeTruthy();
  const model = (await response.json()).items.find(item => item.type === type && item.isActive && predicate(item));
  expect(model, `Seed an active ${type} model with the required capabilities`).toBeTruthy();
  return model;
}

async function generationCases(page) {
  const response = await page.request.get("/api/models");
  expect(response.ok(), "The isolated fixture model catalog must be available").toBeTruthy();
  const models = (await response.json()).items;
  return ["image", "audio", "video"].map(mediaType => {
    const model = models.find(item => item.type === mediaType && item.isActive && (mediaType !== "video" || item.meta?.supports_init_image === true));
    expect(model, `Seed an active ${mediaType} model with the required capabilities`).toBeTruthy();
    return { kind: `generate.${mediaType}`, mediaType, label: `Generate ${mediaType[0].toUpperCase()}${mediaType.slice(1)}`,
      model, modelKey: model.key, option: model.label,
      prompt: `A short deterministic ${mediaType} fixture` };
  });
}

async function selectNodeFromHeader(node) {
  const header = node.locator("[data-space-node-header]");
  await header.hover();
  const box = await header.boundingBox();
  if (!box) throw new Error("Node header has no pointer bounds");
  await node.page().mouse.click(box.x + 1, box.y + 1);
}

async function activateNodeBody(body) {
  const frame = await body.getAttribute("data-body-interactive") === null
    ? body.locator("[data-body-interactive]").first() : body;
  if (await frame.getAttribute('data-body-interactive') === 'false') {
    await frame.locator('[data-space-node-body]').click();
    await expect(frame).toHaveAttribute('data-body-interactive', 'true');
  }
}

async function uploadInputMedia(body, files) {
  const page = body.page();
  await activateNodeBody(body);
  const upload = body.getByRole("button", { name: "Upload", exact: true });
  await expect(upload).toBeEnabled();
  await expect(body.getByRole("button", { name: "Assets", exact: true })).toBeVisible();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), upload.click()]);
  await chooser.setFiles(files);
}

async function activateEditor(field) {
  const display = field.locator("xpath=ancestor::*[@data-node-text-editor][1]").locator("[data-node-text-display]");
  if (await display.count()) {
    await display.focus();
    await display.press("Enter");
  }
  else await field.focus();
  await expect(field).toBeFocused();
}

async function fillEditor(field, value) {
  await activateEditor(field);
  await expect(field).toBeEditable();
  await field.fill(value);
}

async function editorText(field) {
  return field.evaluate(element => "value" in element ? element.value : element.textContent ?? "");
}

async function expectEditorText(field, value) {
  await expect.poll(() => editorText(field)).toBe(value);
}

async function chooseSelect(page, trigger, option) {
  await trigger.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

function modelCard(page, dialog, key) {
  return dialog.getByRole("list", { name: /^(All models|모든 모델)$/ }).getByRole("listitem")
    .filter({ has: page.getByText(key, { exact: true }) }).getByRole("button");
}

async function openAssetsSearch(page, dialog) {
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  const search = page.getByRole("searchbox");
  await expect(search).toBeFocused();
  return search;
}

async function searchAssets(page, dialog, value) {
  const search = await openAssetsSearch(page, dialog);
  await fillEditor(search, value);
  // At390px the filter popover covers the first result. Dismiss that inner
  // surface through its keyboard contract before clicking the selected asset.
  await search.press("Escape");
  await expect(search).toBeHidden();
  await expect(dialog).toBeVisible();
}

async function openModelSearch(page, dialog) {
  await dialog.getByRole("button", { name: /^(Search|검색)$/, exact: true }).click();
  const search = page.getByRole("searchbox", { name: /^(Search models|모델 검색)$/ });
  await expect(search).toBeFocused();
  return search;
}

async function resultInput(page, graphId, sourceId, execution, portId, index = 0) {
  const snapshot = await waitForWorkflowState(page, graphId, value => value.nodes.some(node => {
    const source = node.config?.resultSource;
    return source?.nodeId === sourceId && source.executionId === execution.executionId
      && source.portId === portId && source.index === index && source.state === "completed"
      && typeof node.config.assetId === "string";
  }), `Result input for ${portId}[${index}] was not persisted`);
  const result = snapshot.nodes.find(node => {
    const source = node.config?.resultSource;
    return source?.nodeId === sourceId && source.executionId === execution.executionId && source.portId === portId && source.index === index;
  });
  const binding = execution.outputBindings?.find(item => item.portId === portId && item.sortOrder === index);
  if (binding) expect(result.config.assetId).toBe(binding.assetId);
  else expect(execution.outputAssetIds).toContain(result.config.assetId);
  expect(snapshot.edges).toEqual(expect.arrayContaining([expect.objectContaining({
    sourceNodeId: sourceId, sourcePortId: portId, targetNodeId: result.id,
    targetPortId: result.kind === "input.image" ? "reference" : result.kind.slice("input.".length),
  })]));
  return result;
}

function nodeById(page, id) {
  return page.locator(`[data-space-node-id="${id}"]`);
}

async function expectMedia(page, node, assetId, mediaType) {
  await fitCanvas(page);
  const body = nodeById(page, node.id);
  if (mediaType === "image") {
    await expect.poll(() => body.locator("img").first().evaluate(image => image.complete && image.naturalWidth > 0), { timeout: 30_000 }).toBe(true);
  } else if (mediaType === "audio") {
    await expect(body.locator('[data-space-audio-waveform="ready"] svg')).toBeVisible({ timeout: 30_000 });
    await selectNodeFromHeader(body);
    await activateNodeBody(body);
    const play = body.getByRole("button", { name: "Play", exact: true });
    await play.click();
    await expect(body.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await body.getByRole("button", { name: "Pause", exact: true }).click();
  } else await expectPlayableVideo(body.locator("video"), assetId);
}

async function openAllNodes(page) {
  const button = page.locator('[data-canvas-action="all-nodes"]');
  await expect(button).toBeVisible();
  await button.click();
  return page.getByRole("dialog", { name: "Add node", exact: true });
}

async function addNodeFromToolbar(page, label) {
  const nodes = page.locator('[data-space-canvas] .react-flow__node');
  const previous = await nodes.count();
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(nodes).toHaveCount(previous + 1);
}

async function addNodeFromAllNodes(page, label) {
  const nodes = page.locator('[data-space-canvas] .react-flow__node');
  const previous = await nodes.count();
  const menu = await openAllNodes(page);
  const item = menu
    .getByRole("option", { name: label, exact: true });
  await expect(item).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) < 600) {
    // The responsive popover can sit beneath the React Flow pane's hit-test
    // layer even while its menu item is visibly within the viewport. Use the
    // accessible keyboard activation path so the real React menu callback is
    // invoked without a brittle coordinate workaround.
    await item.focus();
    await expect(item).toBeFocused();
    await page.keyboard.press("Enter");
  } else {
    await item.click();
  }
  await expect(nodes).toHaveCount(previous + 1);
}

async function paletteHasNode(page, label) {
  const menu = await openAllNodes(page);
  const item = menu
    .getByRole("option", { name: label, exact: true });
  const present = await item.count() > 0 && await item.isVisible().catch(() => false);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  return present;
}

const NODE_KINDS = Object.fromEntries(CANONICAL_NODE_CASES.flatMap(item => [[item.title, item.kind], [item.palette, item.kind]]));

function nodeBody(page, label) {
  const kind = NODE_KINDS[label];
  if (!kind) throw new Error(`Unknown authorable node: ${label}`);
  return page.locator(`[data-space-canvas] [data-space-node="${kind}"]`).first();
}

function fixtureId(graph, label) {
  return `${graph.id}-${label}`;
}

function reactFlowNodeForArticle(page, label) {
  return nodeBody(page, label)
    .locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' react-flow__node ')][1]")
    .first();
}

async function connectHandles(page, sourceNode, targetNode, sourceType, targetType) {
  const sourceHandle = sourceNode.locator(`.react-flow__handle.source[data-value-type="${sourceType}"][data-visible="true"]`).first();
  const targetHandle = targetNode.locator(`.react-flow__handle.target[data-value-type="${targetType}"][data-visible="true"]`).first();
  return connectHandleLocators(page, sourceHandle, targetHandle);
}

async function exposedHandlePoint(page, box, side) {
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const outward = side === "source" ? [2, 1, 0, -1, -2] : [-2, -1, 0, 1, 2];
  const points = outward.flatMap((dx) => [0, -1, 1, -2, 2].map((dy) => ({
    x: center.x + dx,
    y: center.y + dy,
  })));
  return page.evaluate((candidates) => candidates.find(({ x, y }) =>
    Boolean(document.elementFromPoint(x, y)?.closest?.(".react-flow__handle")),
  ) ?? null, points);
}

async function connectHandleLocators(page, sourceHandle, targetHandle) {
  const sourceId = await sourceHandle.locator('xpath=ancestor::*[@data-id][1]').getAttribute('data-id');
  const targetId = await targetHandle.locator('xpath=ancestor::*[@data-id][1]').getAttribute('data-id');
  await expect(sourceHandle).toBeVisible();
  await expect(targetHandle).toBeVisible();
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetHandle.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("image connection handles have no boxes");
  const sourcePoint = await exposedHandlePoint(page, sourceBox, "source");
  let targetPoint = await exposedHandlePoint(page, targetBox, "target");
  expect(sourcePoint, `source handle has no exposed hit area: ${JSON.stringify(sourceBox)}`).toBeTruthy();
  expect(targetPoint, `target handle has no exposed hit area: ${JSON.stringify(targetBox)}`).toBeTruthy();
  if (!sourcePoint || !targetPoint) throw new Error("connection handle hit area is covered");
  await page.mouse.move(sourcePoint.x, sourcePoint.y);
  const sourceHit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    const rect = element?.getBoundingClientRect?.();
    return {
      className: element instanceof HTMLElement ? element.className : String(element?.nodeName ?? "none"),
      handle: Boolean(element?.closest?.(".react-flow__handle")),
      rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
    };
  }, sourcePoint);
  expect(sourceHit.handle, `source handle is covered at ${JSON.stringify(sourcePoint)} by ${JSON.stringify(sourceHit)}`).toBeTruthy();
  await page.mouse.down();
  let targetHit = { className: "none", handle: false };
  for (let attempt = 0; attempt < 6 && !targetHit.handle; attempt += 1) {
    await page.mouse.move(targetPoint.x, targetPoint.y, { steps: attempt === 0 ? 32 : 4 });
    await page.waitForTimeout(80);
    const movedTargetBox = await targetHandle.boundingBox();
    if (movedTargetBox) {
      targetPoint = await exposedHandlePoint(page, movedTargetBox, "target") ?? targetPoint;
      await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 2 });
    }
    targetHit = await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return {
        className: element instanceof HTMLElement ? element.className : String(element?.nodeName ?? "none"),
        handle: Boolean(element?.closest?.(".react-flow__handle")),
      };
    }, targetPoint);
  }
  await expect(targetHandle).toHaveClass(/\bconnectingto\b/);
  await expect(targetHandle).toHaveClass(/\bvalid\b/);
  await page.mouse.up();
  expect(targetHit.handle, `target handle is covered at ${JSON.stringify(targetPoint)} by ${targetHit.className}`).toBeTruthy();
  await expect(page.locator(`.react-flow__edge[aria-label="Edge from ${sourceId} to ${targetId}"]`)).toBeAttached();
}

async function dragNodeByArticleBorder(page, node, distance) {
  const box = await node.boundingBox();
  if (!box) throw new Error("ReactFlow node has no box");
  const nodeId = await node.getAttribute("data-id");
  const header = nodeId
    ? page.locator(`[data-space-node-header="${nodeId}"]`)
    : null;
  const headerBox = header && await header.count() > 0 ? await header.boundingBox() : null;
  // Stay inside the node's drag surface. Starting on the exact top edge can
  // hit React Flow's selected-node resize line instead of the node itself,
  // while header-heavy presenters (notably Output) put `nodrag` text at the
  // top-center point. Choose the first DOM-tested unblocked point, retaining
  // center-top as the preferred point for ordinary nodes.
  const candidates = [
    ...(headerBox ? [{ x: headerBox.x + 1, y: headerBox.y + 1 }, { x: headerBox.x + headerBox.width / 2, y: headerBox.y + headerBox.height / 2 }] : []),
    { x: box.x + box.width / 2, y: box.y + Math.min(12, Math.max(2, box.height / 4)) },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    { x: box.x + Math.min(24, Math.max(2, box.width / 4)), y: box.y + box.height / 2 },
    { x: box.x + Math.max(2, box.width - Math.min(24, Math.max(2, box.width / 4))), y: box.y + box.height / 2 },
  ];
  const surface = await page.evaluate((points) => points.map((point) => {
    const element = document.elementFromPoint(point.x, point.y);
    return {
      point,
      className: element instanceof HTMLElement ? element.className : String(element?.nodeName ?? "none"),
      insideNode: Boolean(element?.closest?.(".react-flow__node")),
      insideHeader: Boolean(element?.closest?.('[data-space-node-header]')),
      blocked: Boolean(element?.closest?.(".nodrag, .react-flow__resize-control, input, textarea, button, select")),
    };
  }), candidates);
  const dragSurface = surface.find((candidate) => (candidate.insideNode || candidate.insideHeader) && !candidate.blocked) ?? surface[0];
  const start = dragSurface.point;
  expect(dragSurface.insideNode || dragSurface.insideHeader, `node drag point is outside the node/header: ${JSON.stringify(dragSurface)}`).toBeTruthy();
  expect(dragSurface.blocked, `node drag point is blocked: ${JSON.stringify(dragSurface)}`).toBeFalsy();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let step = 1; step <= 64; step += 1) {
    await page.mouse.move(start.x + (distance.x * step) / 64, start.y + (distance.y * step) / 64, { steps: 1 });
  }
  await page.mouse.up();
  await page.waitForTimeout(250);
}

async function dragNodeByBody(page, node, distance) {
  const body = node.locator('[data-space-node-body]'), box = await body.boundingBox();
  if (!box) throw new Error('Node body has no bounds');
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const hit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return { body: Boolean(element?.closest('[data-space-node-body]')), blocked: Boolean(element?.closest('.nodrag, input, textarea, button, video, audio')) };
  }, start);
  expect(hit, 'The actual body must be a drag surface before entering control mode').toEqual({ body: true, blocked: false });
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + distance.x, start.y + distance.y, { steps: 16 }); await page.mouse.up();
  await expect(node.locator('[data-space-node]')).toHaveAttribute('data-body-interactive', 'false');
}

async function dragNodeToViewportPosition(page, node, position) {
  const box = await node.boundingBox();
  if (!box) throw new Error("ReactFlow node has no box");
  await dragNodeByArticleBorder(page, node, {
    x: position.x - box.x,
    y: position.y - box.y,
  });
}

async function fitCanvas(page) {
  // A full reload remounts the Next dev portal after waitForCanvas installed
  // its pointer-events guard; keep Fit View pointer-testable in dev E2E too.
  await page.addStyleTag({ content: "nextjs-portal { pointer-events: none !important; }" }).catch(() => undefined);
  await page.getByRole("button", { name: /^(Fit View|화면에 맞추기|전체 보기)$/ }).click();
  const viewport = page.locator('.react-flow__viewport');
  await expect.poll(() => viewport.evaluate(async element => {
    const transform = element.style.transform;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return element.style.transform === transform;
  }), { intervals: [50, 100, 200], message: "Fit View must finish moving the viewport" }).toBe(true);
}

function attachErrorCapture(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack ?? error.message}`));
  page.on("console", (message) => {
    if (isConsoleError(message)) {
      const source = message.location().url;
      errors.push(`console.error: ${message.text()}${source ? ` (${source})` : ""}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.request().method()} ${response.url()}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "unknown request failure";
    const expectedCancellation = failure === "net::ERR_ABORTED" && (
      request.method() === "GET" ||
      request.url().includes("/api/models") ||
      request.url().includes("/generation-events") ||
      (request.method() === "PUT" && /\/api\/media-assets\/uploads\/[^/]+\/content\?/.test(request.url()))
    );
    if (!expectedCancellation) errors.push(`requestfailed: ${request.method()} ${request.url()} (${failure})`);
  });
  return errors;
}

async function captureEvidenceScreenshot(page, testInfo, name) {
  // A sized <img> can be "visible" before decoding. Evidence must show the
  // actual result pixels, not an empty node while its media request is pending.
  await expect.poll(async () => page.locator('[data-space-canvas] img').evaluateAll(
    (images) => images.filter((image) => image.getBoundingClientRect().width > 0)
      .every((image) => image.complete && image.naturalWidth > 0),
  ), { timeout: 30_000, message: "Canvas result images did not decode before screenshot" }).toBe(true);
  const directory = path.resolve("artifacts/spaces-e2e/evidence");
  await mkdir(directory, { recursive: true });
  await page.screenshot({
    path: path.join(directory, `${name}-${testInfo.project.name}.png`),
    fullPage: true,
  });
}

async function mediaAssetDigest(page, assetId) {
  const response = await page.request.get(`/api/media-assets/${encodeURIComponent(assetId)}/content`);
  if (!response.ok()) throw new Error(`read media asset failed: ${response.status()} ${await response.text()}`);
  return createHash("sha256").update(await response.body()).digest("hex");
}

async function waitForCompletedMediaOperation(page, graphId, nodeId, timeout = 60_000, executionId) {
  await expect.poll(
    async () => {
      const response = await page.request.get(
        `/api/generation-graphs/${encodeURIComponent(graphId)}/nodes/${encodeURIComponent(nodeId)}/executions`,
      );
      if (!response.ok()) return null;
      const payload = await response.json();
      return payload.executions?.find((execution) =>
        (!executionId || execution.executionId === executionId) && execution.executionKind === "media_operation" &&
        execution.status === "completed" &&
        Array.isArray(execution.outputAssetIds) &&
        execution.outputAssetIds.length > 0,
      ) ?? null;
    },
    { timeout, intervals: [250, 500, 1_000, 2_000], message: "media operation did not complete" },
  ).toMatchObject({ executionKind: "media_operation", status: "completed" });
  const response = await page.request.get(
    `/api/generation-graphs/${encodeURIComponent(graphId)}/nodes/${encodeURIComponent(nodeId)}/executions`,
  );
  const payload = await response.json();
  return payload.executions.find((execution) =>
    (!executionId || execution.executionId === executionId) && execution.executionKind === "media_operation" &&
    execution.status === "completed" &&
    Array.isArray(execution.outputAssetIds) &&
    execution.outputAssetIds.length > 0,
  );
}

async function runMediaOperation(page, graphId, nodeId, button, timeout = 60_000) {
  const route = `/api/generation-graphs/${encodeURIComponent(graphId)}/nodes/${encodeURIComponent(nodeId)}/executions`;
  await expect(button).toBeEnabled({ timeout });
  const startedResponsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && new URL(response.url()).pathname === route,
    { timeout },
  );
  // Native keyboard activation is part of the actual button contract
  // and remains deterministic when an overview viewport places a control under
  // React Flow's minimap or a subpixel-scaled floating header.
  await button.focus();
  await button.press("Enter");
  const startedResponse = await startedResponsePromise;
  expect(startedResponse.ok(), `media operation start failed: ${startedResponse.status()} ${await startedResponse.text()}`).toBeTruthy();
  const started = await startedResponse.json();
  const completed = await waitForCompletedMediaOperation(page, graphId, nodeId, timeout, started.execution.executionId);
  return {
    ...completed,
    plan: started.execution?.plan,
  };
}

async function waitForCompletedGeneration(page, graphId, nodeId, timeout = 60_000, executionId) {
  const route = `/api/generation-graphs/${encodeURIComponent(graphId)}/nodes/${encodeURIComponent(nodeId)}/executions`;
  let latest = null;
  try { await expect.poll(
    async () => {
      const response = await page.request.get(route);
      if (!response.ok()) return null;
      const payload = await response.json();
      latest = payload.executions?.[0] ?? null;
      return payload.executions?.find((execution) =>
        (!executionId || execution.executionId === executionId) && execution.executionKind === "generation" &&
        execution.status === "completed" &&
        Array.isArray(execution.outputAssetIds) &&
        execution.outputAssetIds.length > 0,
      ) ?? null;
    },
    { timeout, intervals: [250, 500, 1_000, 2_000], message: "hosted generation did not complete" },
  ).toMatchObject({ executionKind: "generation", status: "completed" }); }
  catch (error) { throw new Error(`hosted generation did not complete; latest=${JSON.stringify(latest)}`, {cause:error}); }
  const response = await page.request.get(route);
  if (!response.ok()) throw new Error(`read generation executions failed: ${response.status()} ${await response.text()}`);
  const payload = await response.json();
  const completed = payload.executions?.find((execution) =>
    (!executionId || execution.executionId === executionId) && execution.executionKind === "generation" &&
    execution.status === "completed" &&
    Array.isArray(execution.outputAssetIds) &&
    execution.outputAssetIds.length > 0,
  );
  if (!completed) throw new Error(`generation completion disappeared; latest=${JSON.stringify(latest)}`);
  return completed;
}

async function runHostedGeneration(page, graphId, nodeId, header, timeout = 60_000, runButton = header.getByRole("button", { name: "Run this node" })) {
  expect(process.env.NODE_STUDIO_E2E_MOCK_GENERATION, "Start the isolated server with NODE_STUDIO_E2E_MOCK_GENERATION=1 and pass the same flag to Playwright").toBe("1");
  const route = `/api/generation-graphs/${encodeURIComponent(graphId)}/nodes/${encodeURIComponent(nodeId)}/executions`;
  const startedResponsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && new URL(response.url()).pathname === route,
    { timeout },
  );
  await expect(runButton).toBeEnabled();
  await runButton.focus();
  await runButton.press("Enter");
  const startedResponse = await startedResponsePromise;
  expect(startedResponse.ok(), `generation start failed: ${startedResponse.status()} ${await startedResponse.text()}`).toBeTruthy();
  const started = await startedResponse.json();
  const completed = await waitForCompletedGeneration(page, graphId, nodeId, timeout, started.execution.executionId);
  return { ...completed, plan: started.execution?.plan };
}

test.describe("Spaces native editor Chromium regression", () => {
  test("Prompt editor submits, cancels, and isolates Canvas shortcuts", { tag: ["@spaces-prompt", "@spaces-canvas", "@spaces-smoke"] }, async ({ page }, testInfo) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await replaceWorkflowViaApi(page, graph.id, [
        { id: fixtureId(graph, "prompt-editor"), kind: "input.prompt", configVersion: 1, position: { x: 0, y: 0 }, config: { text: "Original prompt" }, selectedOutputAssetId: null },
      ]);
      await waitForFreshWorkflow(page, graph);
      const body = nodeBody(page, "Prompt");
      await selectNodeFromHeader(body);
      const expand = page.locator(`[data-space-node-header="${fixtureId(graph, "prompt-editor")}"]`).getByTitle("Expand editor");
      await expand.click();
      const editor = page.getByRole("dialog", { name: "Edit Prompt", exact: true });
      const text = editor.getByRole("textbox", { name: "Prompt", exact: true });
      await expect(text).toBeFocused();
      await expect(text).toHaveValue("Original prompt");
      await fillEditor(text, "Edited prompt");
      await page.keyboard.press("Shift+i");
      const submitted = await editorText(text);
      await editor.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(editor).toBeHidden();
      const saved = await waitForWorkflowState(page, graph.id, (value) => value.nodes[0]?.config.text === submitted, "Prompt editor submit not saved");
      expect(saved.nodes).toHaveLength(1);
      await expect(expand).toBeFocused();
      await expand.click();
      await fillEditor(text, "Discard this draft");
      await page.keyboard.press("Escape");
      const confirmation = page.getByRole("alertdialog", { name: "Unsaved prompt changes", exact: true });
      await expect(confirmation).toBeVisible();
      await captureEvidenceScreenshot(page, testInfo, "t30-prompt-confirmation");
      await confirmation.getByRole("button", { name: "Discard", exact: true }).click();
      await expect(editor).toBeHidden();
      expect((await readWorkflowViaApi(page, graph.id)).nodes[0].config.text).toBe(submitted);
      await page.reload(); await waitForFreshWorkflow(page, graph, false);
      await expect(nodeBody(page, "Prompt").locator("textarea")).toHaveValue(submitted);
      expect(errors).toEqual([]);
    } finally { await deleteWorkflowViaApi(page, graph.id); }
  });

  test("Prompt Constructor expands, resolves variables, reloads and isolates Delete with Undo", { tag: ["@spaces-prompt", "@spaces-canvas"] }, async ({ page }, testInfo) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      const node = (id, kind, config, x) => ({ id, kind, config, configVersion: 1, position: { x, y: 0 }, selectedOutputAssetId: null });
      await replaceWorkflowViaApi(page, graph.id, [
        node(fixtureId(graph, "named"), "input.prompt", { variableName: "cat", text: "@cat_long" }, 0),
        node(fixtureId(graph, "inline"), "input.prompt", { text: '<var="cat_long">fox</var>' }, 400),
        node(fixtureId(graph, "constructor"), "process.promptConstructor", { template: "@cat / @cat_long / @missing" }, 800),
      ], [fixtureId(graph, "named"), fixtureId(graph, "inline")].map((id, sortOrder) => ({ id: fixtureId(graph, `edge-${id}`), sourceNodeId: id, sourcePortId: "text", targetNodeId: fixtureId(graph, "constructor"), targetPortId: "text", sortOrder, hasPause: false })));
      await waitForFreshWorkflow(page, graph);
      const body = nodeBody(page, "Prompt Constructor");
      await expect(page.locator(`.react-flow__node[data-id="${fixtureId(graph, "constructor")}"]`)).toHaveCSS("width", "340px");
      await activateEditor(body.locator("textarea"));
      const expand = page.locator(`[data-space-node-header="${fixtureId(graph, "constructor")}"]`).getByTitle("Expand editor");
      await expand.click();
      const editor = page.getByRole("dialog", { name: "Edit Prompt", exact: true });
      await expect(editor.getByRole("textbox")).toBeFocused();
      await expect(editor.getByRole("textbox")).toHaveAttribute("title", "Preview: @cat_long / fox / @missing");
      await fillEditor(editor.getByRole("textbox"), "Portrait: @cat_long");
      await editor.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(editor).toBeHidden();
      const saved = await waitForWorkflowState(page, graph.id, (value) => value.nodes.find((node) => node.id === fixtureId(graph, "constructor"))?.config.template === "Portrait: @cat_long", "Constructor template not saved");
      expect(saved.nodes.find((node) => node.id === fixtureId(graph, "constructor")).config).not.toHaveProperty("outputText");
      await page.reload(); await waitForFreshWorkflow(page, graph, false);
      await activateEditor(body.locator("textarea")); await expand.click();
      await expect(editor.getByRole("textbox")).toHaveAttribute("title", "Preview: Portrait: fox");
      await captureEvidenceScreenshot(page, testInfo, "t33-prompt-constructor");
      await page.keyboard.press("Escape");
      await expect(editor).toBeHidden();
      const constructor = page.locator(`.react-flow__node[data-id="${fixtureId(graph, "constructor")}"]`);
      const textarea = nodeBody(page, "Prompt Constructor").locator("textarea");
      await fillEditor(textarea, "memoX");
      await page.keyboard.press("Backspace");
      await expect(textarea).toHaveValue("memo");
      await page.keyboard.press("Delete");
      await expect(constructor).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(textarea).not.toBeFocused();
      await expect(constructor).toHaveClass(/selected/);
      await page.keyboard.press("Delete");
      await waitForWorkflowState(page, graph.id,
        (snapshot) => !snapshot.nodes.some((entry) => entry.id === fixtureId(graph, "constructor")) && !snapshot.edges.some((edge) => edge.targetNodeId === fixtureId(graph, "constructor")),
        "Delete did not remove the selected Prompt Constructor and its edge");
      await page.keyboard.press("ControlOrMeta+z");
      await waitForWorkflowState(page, graph.id,
        (snapshot) => snapshot.nodes.some((entry) => entry.id === fixtureId(graph, "constructor")) && snapshot.edges.filter((edge) => edge.targetNodeId === fixtureId(graph, "constructor")).length === 2,
        "Undo did not restore the Prompt Constructor and its edge");
      await activateEditor(textarea);
      await page.keyboard.press("Escape");
      await expect(constructor).toHaveClass(/selected/);
      await page.keyboard.press("Backspace");
      await waitForWorkflowState(page, graph.id,
        (snapshot) => !snapshot.nodes.some((entry) => entry.id === fixtureId(graph, "constructor")),
        "Backspace did not remove the restored Prompt Constructor");
      await page.reload();
      await expect(constructor).toHaveCount(0);

      expect(errors).toEqual([]);
    } finally { await deleteWorkflowViaApi(page, graph.id); }
  });

  test("Quickstart lists six presets, creates both content modes and opens the tutorial", { tag: "@spaces-canvas" }, async ({ page }, testInfo) => {
    const errors = attachErrorCapture(page), requestedSamples = [];
    page.on("request", (request) => { if (/sample-images|template-thumbnails|community-workflows|api\/quickstart/.test(request.url())) requestedSamples.push(request.url()); });
    const original = await createWorkflowViaApi(page), created = [];
    const before = await readWorkflowViaApi(page, original.id);
    const presets = ["Product Shot", "Model + Product", "Color Variations", "Background Swap", "Style Transfer", "Scene Composite"];
    try {
      for (const [index, preset] of presets.slice(0, 2).entries()) {
        await waitForFreshWorkflow(page, original);
        await page.getByRole("button", { name: "Quickstart", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Quickstart", exact: true });
        await dialog.getByRole("button", { name: "Templates Pre-built workflows" }).click();
        const explorer = page.getByRole("dialog", { name: "Template Explorer", exact: true });
        for (const title of presets) await expect(explorer.getByRole("heading", { name: title, exact: true })).toBeVisible();
        await chooseSelect(page, explorer.getByRole("combobox", { name: "Starting content" }), index % 2 ? "Empty inputs" : "Prompt examples");
        if (index === 0) await captureEvidenceScreenshot(page, testInfo, "t33-quickstart-presets");
        await explorer.getByRole("article").filter({ has: page.getByRole("heading", { name: preset, exact: true }) }).getByRole("button", { name: "Use workflow", exact: true }).click();
        await expect.poll(() => new URL(page.url()).pathname).not.toBe(`/spaces/${original.id}`);
        const id = new URL(page.url()).pathname.split("/").at(-1); created.push(id);
        const saved = await readWorkflowViaApi(page, id);
        expect(saved.nodes.length).toBeGreaterThan(2);
        expect(saved.title).toBe(preset);
        expect(saved.nodes.filter((node) => node.kind === "generate.image").every((node) => node.config.modelKey === null)).toBe(true);
        expect(saved.nodes.filter((node) => node.kind === "input.image").every((node) => node.config.assetId === null)).toBe(true);
        expect(saved.nodes.every((node) => node.selectedOutputAssetId === null)).toBe(true);
        if (index % 2) expect(saved.nodes.filter((node) => node.kind === "input.prompt").every((node) => node.config.text === "")).toBe(true);
        await page.goto(`/spaces/${original.id}`);
      }
      await waitForFreshWorkflow(page, original);
      await page.getByRole("button", { name: "Quickstart", exact: true }).click();
      await page.getByRole("button", { name: "Tutorial Learn the basics in a new Space" }).click();
      await expect(page).toHaveURL(/tutorial=1/);
      const tutorialId = new URL(page.url()).pathname.split("/").at(-1); created.push(tutorialId);
      await expect(page.getByRole("button", { name: "Skip tutorial", exact: true })).toBeVisible();
      expect((await readWorkflowViaApi(page, tutorialId)).nodes).toHaveLength(0);
      await expect(page.getByText("Click the Image button to add an image node.", { exact: true })).toBeVisible({ timeout: 10000 });
      await page.locator('[data-space-floating-bar]').getByRole("button", { name: "Image", exact: true }).click();
      await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.getByText("Inputs always go in on the left side of the node.", { exact: true })).toBeVisible();
      await captureEvidenceScreenshot(page, testInfo, "t33-tutorial");
      await page.getByRole("button", { name: "Skip tutorial", exact: true }).click();
      await expect(page).not.toHaveURL(/tutorial=1/);
      await expect(page.getByRole("button", { name: "Skip tutorial", exact: true })).toBeHidden();
      expect((await readWorkflowViaApi(page, original.id))).toEqual(before);
      expect(requestedSamples).toEqual([]); expect(errors).toEqual([]);
    } finally { for (const id of [...created, original.id]) await deleteWorkflowViaApi(page, id); }
  });

  test("adaptive preview changes with zoom but Input download keeps original bytes", { tag: ["@spaces-media", "@spaces-canvas"] }, async ({ page }, testInfo) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    const original = deterministicPng(512, 384, 1);
    try {
      await replaceWorkflowViaApi(page, graph.id, [{ id: fixtureId(graph, "adaptive-image"), kind: "input.image", configVersion: 1, position: { x: 0, y: 0 }, config: { assetId: null }, selectedOutputAssetId: null }]);
      await waitForFreshWorkflow(page, graph);
      const body = nodeBody(page, "Image Input");
      await uploadInputMedia(body, { name: "leesfield-adaptive-source.png", mimeType: "image/png", buffer: original });
      const saved = await waitForWorkflowState(page, graph.id, (value) => Boolean(value.nodes[0].config.assetId), "adaptive input upload not durable");
      const preview = body.locator("img").first();
      await expect.poll(() => preview.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
      // Use actual zoom controls across the200px effective-width boundary.
      for (let index = 0; index < 4; index += 1) await page.getByRole("button", { name: "Zoom In", exact: true }).click();
      const originalAsset = (await (await page.request.get(`/api/media-assets/${saved.nodes[0].config.assetId}`)).json()).asset;
      await expect.poll(() => preview.getAttribute("src")).toBe(originalAsset.url);
      const thumbnailUrl = originalAsset.imageVariants?.thumbnail?.url;
      const isSmallPreview = source => thumbnailUrl ? source === thumbnailUrl : source?.startsWith("data:image/jpeg");
      for (let index = 0; index < 10; index += 1) {
        if (isSmallPreview(await preview.getAttribute("src"))) break;
        const out = page.getByRole("button", { name: "Zoom Out", exact: true });
        if (await out.isDisabled()) break;
        await out.click();
      }
      await expect.poll(async () => isSmallPreview(await preview.getAttribute("src"))).toBe(true);
      await expect.poll(() => preview.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
      await captureEvidenceScreenshot(page, testInfo, "t30-adaptive-thumbnail");
      await body.hover();
      const downloading = page.waitForEvent("download");
      await body.getByRole("link", { name: "Download image", exact: true }).click();
      const download = await downloading;
      const bytes = await readFile(await download.path());
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(createHash("sha256").update(original).digest("hex"));
      expect(await mediaAssetDigest(page, saved.nodes[0].config.assetId)).toBe(createHash("sha256").update(original).digest("hex"));
      await page.reload(); await waitForFreshWorkflow(page, graph, false);
      await expect.poll(() => preview.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
      expect((await readWorkflowViaApi(page, graph.id)).nodes[0].config.assetId).toBe(saved.nodes[0].config.assetId);
      expect(errors).toEqual([]);
    } finally { await deleteWorkflowViaApi(page, graph.id); }
  });

  test("owner model defaults use model picker and persist only into new Space nodes", { tag: ["@spaces-settings", "@spaces-generation"] }, async ({ page }, testInfo) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    const preferenceResponse = await page.request.get("/api/spaces/preferences");
    expect(preferenceResponse.ok()).toBeTruthy();
    const original = (await preferenceResponse.json()).preferences;
    const items = (await (await page.request.get("/api/models")).json()).items;
    const models = ["image", "video", "audio"].map((kind) => items.find((model) => model.type === kind && model.isActive));
    expect(models.every(Boolean), "fixture catalog must have every supported media kind").toBe(true);
    try {
      await waitForFreshWorkflow(page, graph);
      await page.getByRole("button", { name: "Space settings", exact: true }).click();
      const settings = page.getByRole("dialog", { name: "Space Settings" });
      await settings.getByRole("tab", { name: "Node Defaults", exact: true }).click();
      for (const model of models) {
        const title = `Default ${model.type[0].toUpperCase()}${model.type.slice(1)} Model`;
        const row = settings.getByText(title, { exact: true }).locator("..");
        await row.getByRole("button", { name: /^(Select Model|Change)$/ }).click();
        const picker = page.getByRole("dialog", { name: title, exact: true });
        await expect(picker).toBeVisible();
        await fillEditor((await openModelSearch(page, picker)), model.key);
        await page.keyboard.press("Escape");
        const card = modelCard(page, picker, model.key);
        await expect(card).toBeVisible();
        await card.click();
        await expect(picker).not.toBeVisible();
        await expect(row).toContainText(model.label);
      }
      await captureEvidenceScreenshot(page, testInfo, "t30-original-default-models");
      await settings.getByRole("button", { name: "Save", exact: true }).click();
      await expect(settings).not.toBeVisible();
      const readPreferences = async () => (await (await page.request.get("/api/spaces/preferences")).json()).preferences;
      await expect.poll(async () => (await readPreferences()).defaults).toEqual(Object.fromEntries(models.map((model) => [model.type, { modelKey: model.key, parameters: {} }])));
      await page.reload(); await waitForFreshWorkflow(page, graph, false);
      const canvas = page.locator('[data-space-canvas]');
      for (const key of ["g", "v", "t"]) { await canvas.focus(); await page.keyboard.press(`Shift+${key}`); }
      const created = await waitForWorkflowState(page, graph.id, (value) => value.nodes.length === 3, "default model nodes not saved");
      for (const model of models) expect(created.nodes.find((node) => node.kind === `generate.${model.type}`).config.modelKey).toBe(model.key);
      await page.getByRole("button", { name: "All models", exact: true }).click();
      const allModels = page.getByRole("dialog", { name: "All models", exact: true });
      await expect(allModels.getByText("Recently Used", { exact: true })).toBeVisible();
      await captureEvidenceScreenshot(page, testInfo, "t30-original-model-browser");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Space settings", exact: true }).click();
      await settings.getByRole("tab", { name: "Node Defaults", exact: true }).click();
      await settings.getByRole("button", { name: "Reset defaults", exact: true }).click();
      await settings.getByRole("button", { name: "Save", exact: true }).click();
      await expect(settings).not.toBeVisible();
      expect((await readPreferences()).defaults).toEqual({});
      expect((await readWorkflowViaApi(page, graph.id)).nodes.map((node) => node.config)).toEqual(created.nodes.map((node) => node.config));
      expect(errors).toEqual([]);
    } finally {
      const current = (await (await page.request.get("/api/spaces/preferences")).json()).preferences;
      const restored = await page.request.patch("/api/spaces/preferences", { data: { action: "defaults", expectedRevision: current.revision, defaults: original.defaults } });
      expect(restored.ok(), "restore original owner defaults").toBeTruthy();
      await deleteWorkflowViaApi(page, graph.id);
    }
  });

  let originalInlineFixture;
  test.afterEach(async ({ page }) => {
    if (originalInlineFixture === undefined) return;
    const current = (await (await page.request.get("/api/spaces/preferences")).json()).preferences;
    expect((await page.request.patch("/api/spaces/preferences", { data: { action: "inline", expectedRevision: current.revision, enabled: originalInlineFixture } })).ok()).toBeTruthy();
    originalInlineFixture = undefined;
  });
  test.beforeEach(async ({ page }, testInfo) => {
    // Only requests beyond this owner's real burst need pacing. Every request
    // still goes through the unchanged API, storage and confirmation.
    const uploadDelay = createUploadPacer();
    await page.route("**/api/media-assets/uploads", async route => {
      if (route.request().method() !== "POST") return route.continue();
      const delayMs = uploadDelay();
      if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
      if (!page.isClosed()) await route.continue();
    });
    if (/generation media|generation Nodes|real generation Run/.test(testInfo.title)) {
      const current = (await (await page.request.get("/api/spaces/preferences")).json()).preferences;
      originalInlineFixture = current.inlineParametersEnabled ?? false;
      expect((await page.request.patch("/api/spaces/preferences", { data: { action: "inline", expectedRevision: current.revision, enabled: true } })).ok()).toBeTruthy();
    }
    const target = new URL(testInfo.project.use.baseURL);
    expect(target.port, "Port 3000 is reserved for the user's server").not.toBe("3000");
    await page.context().addCookies([{ name: "locale", value: "en", url: target.origin }]);
    await page.addInitScript(() => {
      if (window.top !== window || location.protocol !== "http:") return;
      localStorage.setItem("leesfield.locale", "en");
      if (!localStorage.getItem("node-studio.canvas-settings")) localStorage.setItem("node-studio.canvas-settings", JSON.stringify({ panMode: "space", zoomMode: "altScroll", selectionMode: "shiftDrag" }));
    });
    page.setDefaultTimeout(8_000);
    // setDefaultTimeout also affects navigation unless explicitly overridden.
    page.setDefaultNavigationTimeout(30_000);
  });

  test("canvas clipboard, toolbar drop and media batches persist without stealing form shortcuts", { tag: ["@spaces-canvas", "@spaces-media", "@spaces-prompt"] }, async ({ page, context }) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await waitForFreshWorkflow(page, graph);
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      const canvas = page.locator('[data-space-canvas]');
      await page.evaluate(() => navigator.clipboard.writeText("Durable clipboard prompt"));
      await canvas.focus(); await page.keyboard.press("ControlOrMeta+v");
      await waitForWorkflowState(page, graph.id, (value) => value.nodes.length === 1 && value.nodes[0].config.text === "Durable clipboard prompt", "system prompt paste not persisted");
      const textarea = page.locator('.react-flow__node textarea').first();
      await textarea.focus(); await page.keyboard.press("Shift+i");
      const editedText = await textarea.inputValue();
      expect(editedText).not.toBe("Durable clipboard prompt");
      await canvas.focus(); // Upstream Prompt commits its draft on blur.
      await waitForWorkflowState(page, graph.id, (value) => value.nodes[0]?.config.text === editedText, "form text was not edited");
      expect((await readWorkflowViaApi(page, graph.id)).nodes).toHaveLength(1);
      await canvas.focus(); await page.keyboard.press("?");
      await expect(page.getByRole("dialog", { name: "Keyboard Shortcuts" })).toBeVisible();
      await expect(page.getByText("Run workflow", { exact: true })).toHaveCount(0);
      await page.getByRole("dialog", { name: "Keyboard Shortcuts" }).getByRole("button", { name: "Close", exact: true }).click();
      await canvas.focus(); await page.keyboard.press("Shift+i");
      await waitForWorkflowState(page, graph.id, (value) => value.nodes.length === 2, "Shift I did not create image input");
      const beforeImage = await readWorkflowViaApi(page, graph.id);
      const imageId = beforeImage.nodes.find((node) => node.kind === "input.image").id;
      const png = deterministicPng(40, 30, 1);
      const clipboardBytes = await page.evaluate(async (bytes) => {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([new Uint8Array(bytes)], { type: "image/png" }) })]);
        // Chromium may re-encode PNG when writing to the native clipboard.
        const [item] = await navigator.clipboard.read();
        return [...new Uint8Array(await (await item.getType("image/png")).arrayBuffer())];
      }, [...png]);
      await canvas.focus(); await page.keyboard.press("ControlOrMeta+v");
      await waitForWorkflowState(page, graph.id, (value) => Boolean(value.nodes.find((node) => node.id === imageId)?.config.assetId), "selected image paste was not durable");
      const afterImage = await readWorkflowViaApi(page, graph.id);
      expect(afterImage.nodes).toHaveLength(2);
      expect(await mediaAssetDigest(page, afterImage.nodes.find((node) => node.id === imageId).config.assetId)).toBe(createHash("sha256").update(Buffer.from(clipboardBytes)).digest("hex"));

      const canvasBox = await canvas.boundingBox();
      const dropPoint = { x: canvasBox.x + 40, y: canvasBox.y + 90 };
      const files = [
        { name: "node-banana 한글.png", type: "image/png", bytes: [...deterministicPng(24, 24)] },
        { name: "node-banana.wav", type: "audio/wav", bytes: [...deterministicWav()] },
        { name: "node-banana.mp4", type: "video/mp4", bytes: [...await readFile(path.resolve("public/sample-video.mp4"))] },
      ];
      const dragOver = async () => canvas.evaluate((element, { files, dropPoint }) => {
        const transfer = new DataTransfer();
        for (const file of files) transfer.items.add(new File([new Uint8Array(file.bytes)], file.name, { type: file.type }));
        element.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, clientX: dropPoint.x, clientY: dropPoint.y, dataTransfer: transfer }));
      }, { files, dropPoint });
      await dragOver();
      await expect(page.locator('[data-space-drop-preview]')).toBeVisible();
      expect((await readWorkflowViaApi(page, graph.id)).nodes).toEqual(afterImage.nodes);
      await page.keyboard.press("Escape");
      await expect(page.locator('[data-space-drop-preview]')).toHaveCount(0);
      await dragOver();
      await expect(page.locator('[data-space-drop-preview]')).toBeVisible();
      // Real DOM DataTransfer/File decoding and real upload/confirm; no OS drag automation.
      await canvas.evaluate((element, { files, dropPoint }) => {
        const transfer = new DataTransfer();
        for (const file of files) transfer.items.add(new File([new Uint8Array(file.bytes)], file.name, { type: file.type }));
        element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, clientX: dropPoint.x, clientY: dropPoint.y, dataTransfer: transfer }));
      }, { files, dropPoint });
      await expect(page.locator('[data-space-drop-preview]')).toHaveCount(0);
      await waitForWorkflowState(page, graph.id, (value) => value.nodes.length === 5 && value.nodes.filter(node => !afterImage.nodes.some(old => old.id === node.id)).every(node => Boolean(node.config.assetId)), "three media file batch not persisted", 60_000);
      const dropped = await readWorkflowViaApi(page, graph.id);
      const batch = dropped.nodes.filter((node) => !afterImage.nodes.some((old) => old.id === node.id)).sort((a, b) => a.position.x - b.position.x);
      expect(batch.map((node) => node.kind)).toEqual(["input.image", "input.audio", "input.video"]);
      expect(batch.every((node) => Boolean(node.config.assetId))).toBe(true);
      expect(batch[1].position.x - batch[0].position.x).toBe(240);
      expect(batch[2].position.x - batch[1].position.x).toBe(240);
      await canvas.focus(); await page.keyboard.press("h");
      await waitForWorkflowState(page, graph.id, (value) => {
        const nodes = batch.map((item) => value.nodes.find((node) => node.id === item.id));
        return nodes[1].position.x - nodes[0].position.x !== 240 && nodes.every((node) => node.position.y === nodes[0].position.y);
      }, "horizontal shortcut did not arrange selection");
      await page.keyboard.press("ControlOrMeta+z");
      await waitForWorkflowState(page, graph.id, (value) => value.nodes.find((node) => node.id === batch[1].id).position.x === batch[1].position.x, "layout did not undo once");
      const imageButton = page.locator('[data-space-floating-bar]').getByRole("button", { name: "Image", exact: true });
      await imageButton.dragTo(canvas, { targetPosition: { x: 25, y: 65 } });
      await waitForWorkflowState(page, graph.id, (value) => value.nodes.length === 6, "toolbar node drag not persisted");
      const saved = await readWorkflowViaApi(page, graph.id);
      await page.reload({ waitUntil: "domcontentloaded" }); await waitForCanvas(page, graph.id, false);
      expect((await readWorkflowViaApi(page, graph.id)).nodes).toEqual(saved.nodes);
      for (const node of saved.nodes.filter((entry) => entry.config.assetId)) {
        const body = page.locator(`.react-flow__node[data-id="${node.id}"]`);
        if (node.kind === "input.image") {
          await expect.poll(() => body.locator("img").evaluateAll((images) => images.some((image) => image.complete && image.naturalWidth > 0)), { timeout: 30_000 }).toBe(true);
        } else if (node.kind === "input.video") {
          await expect(body.locator("video")).toBeAttached({ timeout: 30_000 });
          await expect.poll(() => body.locator("video").evaluate((video) => video.readyState >= 1 && video.videoWidth > 0), { timeout: 30_000 }).toBe(true);
        } else {
          await expect(body.getByRole("button", { name: "Play", exact: true })).toBeAttached({ timeout: 30_000 });
          await expect(body.locator("[data-space-audio-waveform] svg")).toBeAttached({ timeout: 30_000 });
        }
      }
      await fitCanvas(page);
      await captureEvidenceScreenshot(page, test.info(), "t29-canvas-input");
      expect(errors).toEqual([]);
    } finally { await deleteWorkflowViaApi(page, graph.id); }
  });

  test("general groups persist controls, gestures, clipboard and undo", { tag: "@spaces-canvas" }, async ({ page }) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await replaceWorkflowViaApi(page, graph.id, [0, 1].map((index) => ({
        id: fixtureId(graph, `group_input_${index}`), kind: "input.image", configVersion: 1,
        position: { x: index * 420, y: 100 }, config: { assetId: null }, selectedOutputAssetId: null,
      })));
      await waitForFreshWorkflow(page, graph);
      await fitCanvas(page);
      const canvas = page.locator('[data-space-canvas]');
      const canvasBox = await canvas.boundingBox();
      const boxes = await page.locator('.react-flow__node').evaluateAll((nodes) => nodes.map((node) => {
        const box = node.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height };
      }));
      const start = { x: Math.max(canvasBox.x + 2, Math.min(...boxes.map((box) => box.x)) - 12),
        y: Math.max(canvasBox.y + 2, Math.min(...boxes.map((box) => box.y)) - 12) };
      const end = { x: Math.min(canvasBox.x + canvasBox.width - 2, Math.max(...boxes.map((box) => box.x + box.width)) + 12),
        y: Math.min(canvasBox.y + canvasBox.height - 2, Math.max(...boxes.map((box) => box.y + box.height)) + 12) };
      await page.keyboard.down("Shift"); await page.mouse.move(start.x, start.y); await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 32 }); await page.mouse.up(); await page.keyboard.up("Shift");
      await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
      await expect(page.locator('[data-space-floating-bar]').getByRole("button", { name: "Run", exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "Create group", exact: true }).click();
      await waitForWorkflowState(page, graph.id, (value) => value.groups.length === 1, "group was not saved");
      let saved = await readWorkflowViaApi(page, graph.id);
      expect(saved.groups[0].memberNodeIds).toEqual(saved.nodes.map((node) => node.id));
      expect(saved.schemaVersion).toBe(3);
      // Marquee selection can auto-pan at the narrow viewport's edge. Restore
      // the user-visible framing before opening the group's radial color menu.
      await fitCanvas(page);
      await page.getByText("Group 1", { exact: true }).dblclick();
      // The original group editor focuses/selects its inline input on double click.
      await expect(page.locator('input:focus')).toHaveValue("Group 1");
      await fillEditor(page.locator('input:focus'), "Retained group");
      await page.keyboard.press("Enter");
      await waitForWorkflowState(page, graph.id, (value) => value.groups[0]?.title === "Retained group", "rename was not saved");
      await page.getByRole("button", { name: "Group options", exact: true }).click();
      await page.getByRole("menuitem", { name: "Background", exact: true }).click();
      await page.getByRole("menuitemradio", { name: "Blue", exact: true }).click();
      await expect(page.getByRole("menu", { name: "Group options" })).toBeVisible();
      await page.getByRole("menuitem", { name: "Lock", exact: true }).click();
      await waitForWorkflowState(page, graph.id, (value) => value.groups[0]?.locked && value.groups[0]?.color === "blue", "properties were not saved");
      saved = await readWorkflowViaApi(page, graph.id);
      const header = await page.getByText("Retained group", { exact: true }).boundingBox();
      await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2);
      await page.mouse.down(); await page.mouse.move(header.x + header.width / 2 + 24, header.y + header.height / 2 + 24, { steps: 12 }); await page.mouse.up();
      await waitForWorkflowState(page, graph.id, (value) => value.groups[0]?.bounds.x !== saved.groups[0].bounds.x, "locked group did not move");
      const moved = await readWorkflowViaApi(page, graph.id);
      const delta = moved.groups[0].bounds.x - saved.groups[0].bounds.x;
      for (const node of moved.nodes) expect(node.position.x - saved.nodes.find((old) => old.id === node.id).position.x).toBeCloseTo(delta, 5);
      await canvas.focus(); await page.keyboard.press("ControlOrMeta+z");
      await waitForWorkflowState(page, graph.id, (value) => value.groups[0]?.bounds.x === saved.groups[0].bounds.x, "group gesture did not undo in one step");
      await page.keyboard.press("ControlOrMeta+Shift+z");
      await waitForWorkflowState(page, graph.id, (value) => value.groups[0]?.bounds.x === moved.groups[0].bounds.x, "group gesture did not redo");
      await fitCanvas(page);
      const resize = await page.getByLabel("Resize group SE", { exact: true }).boundingBox();
      expect(await page.evaluate(({ x, y, width, height }) =>
        document.elementFromPoint(x + width / 2, y + height / 2)?.getAttribute("aria-label") === "Resize group SE", resize)).toBe(true);
      await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2);
      await page.mouse.down(); await page.mouse.move(resize.x - 12, resize.y - 12, { steps: 12 }); await page.mouse.up();
      await waitForWorkflowState(page, graph.id, (value) => value.groups[0]?.bounds.width < moved.groups[0].bounds.width, "group resize was not saved");
      await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
      expect((await readWorkflowViaApi(page, graph.id)).nodes).toEqual(moved.nodes);
      await canvas.focus(); await page.keyboard.press("ControlOrMeta+z");
      await waitForWorkflowState(page, graph.id, (value) => value.groups[0]?.bounds.width === moved.groups[0].bounds.width, "resize did not undo in one step");
      await page.keyboard.press("ControlOrMeta+c"); await page.keyboard.press("ControlOrMeta+v");
      await waitForWorkflowState(page, graph.id, (value) => value.nodes.length === 4 && value.groups.length === 2, "group clipboard was not saved");
      const pasted = await readWorkflowViaApi(page, graph.id);
      const freshGroup = pasted.groups.find((group) => group.id !== moved.groups[0].id);
      expect(freshGroup.memberNodeIds.every((id) => !moved.nodes.some((node) => node.id === id))).toBe(true);
      expect(freshGroup.bounds.x).toBeCloseTo(moved.groups[0].bounds.x + 50, 5);
      await page.getByRole("button", { name: "Remove from group", exact: true }).click();
      await waitForWorkflowState(page, graph.id, (value) => value.groups.some((group) => group.id === freshGroup.id && group.memberNodeIds.length === 0), "ungroup must preserve empty frame");
      await canvas.focus(); await page.keyboard.press("ControlOrMeta+z");
      await waitForWorkflowState(page, graph.id, (value) => value.groups.find((group) => group.id === freshGroup.id)?.memberNodeIds.length === 2, "ungroup did not undo");
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByText("Retained group", { exact: true })).toHaveCount(2);
      const restored = await readWorkflowViaApi(page, graph.id);
      expect(restored.groups).toEqual(pasted.groups);
      await page.getByRole("button", { name: "Group options", exact: true }).first().click();
      await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
      await waitForWorkflowState(page, graph.id, (value) => value.groups.length === 1, "group delete was not saved");
      expect((await readWorkflowViaApi(page, graph.id)).nodes).toEqual(restored.nodes);
      await captureEvidenceScreenshot(page, test.info(), "t28-general-groups");
      expect(errors).toEqual([]);
    } finally { await deleteWorkflowViaApi(page, graph.id); }
  });

  test("selected image ZIP downloads original durable bytes through the toolbar", { tag: ["@spaces-media", "@spaces-canvas"] }, async ({ page }) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await replaceWorkflowViaApi(page, graph.id, [0, 1].map((index) => ({
        id: fixtureId(graph, `zip_input_${index}`), kind: "input.image", configVersion: 1,
        position: { x: index * 420, y: 100 }, config: { assetId: null }, selectedOutputAssetId: null,
      })));
      await waitForFreshWorkflow(page, graph);
      for (const index of [0, 1]) {
        const input = page.locator(`.react-flow__node[data-id="${fixtureId(graph, `zip_input_${index}`)}"]`);
        await uploadInputMedia(input, {
          name: `스크린샷 node-banana ${index}.png`, mimeType: "image/png",
          buffer: deterministicPng(32, 24, index),
        });
        await waitForWorkflowState(page, graph.id, (value) =>
          Boolean(value.nodes.find((node) => node.id === fixtureId(graph, `zip_input_${index}`))?.config.assetId), "ZIP input was not saved");
      }
      const saved = await readWorkflowViaApi(page, graph.id);
      const digests = await Promise.all(saved.nodes.map((node) => mediaAssetDigest(page, node.config.assetId)));
      const digestByNode = new Map(saved.nodes.map((node, index) => [node.id, digests[index]]));
      await fitCanvas(page);
      const inputs = page.locator('.react-flow__node');
      // The canvas retains its document order; equal server creation timestamps
      // do not promise that a fresh API list has that same array order.
      const visibleOrder = await inputs.evaluateAll(nodes => nodes.map(node => decodeURIComponent(node.getAttribute("data-id"))));
      const canvasBox = await page.locator('[data-space-canvas]').boundingBox();
      const boxes = await Promise.all([inputs.nth(0).boundingBox(), inputs.nth(1).boundingBox()]);
      expect(canvasBox).not.toBeNull();
      expect(boxes.every(Boolean)).toBe(true);
      const start = { x: Math.max(canvasBox.x + 2, Math.min(...boxes.map((box) => box.x)) - 12),
        y: Math.max(canvasBox.y + 2, Math.min(...boxes.map((box) => box.y)) - 12) };
      const end = { x: Math.min(canvasBox.x + canvasBox.width - 2, Math.max(...boxes.map((box) => box.x + box.width)) + 12),
        y: Math.min(canvasBox.y + canvasBox.height - 2, Math.max(...boxes.map((box) => box.y + box.height)) + 12) };
      expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.classList.contains("react-flow__pane"), start)).toBe(true);
      await page.keyboard.down("Shift");
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 32 });
      await page.mouse.up();
      await page.keyboard.up("Shift");
      await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
      const button = page.getByRole("button", { name: "Download as ZIP" });
      await expect(button).toBeEnabled();
      const pending = page.waitForEvent("download");
      await button.click();
      const download = await pending;
      expect(download.suggestedFilename()).toMatch(/^leesfield-media-\d+\.zip$/);
      const zipPath = test.info().outputPath("selected-images.zip");
      await download.saveAs(zipPath);
      const bytes = await readFile(zipPath);
      // Header/compression/MIME matrices live in media-zip-download.test.ts.
      // Here observe the actual native download's order, names and input bytes.
      const archive = await JSZip.loadAsync(bytes);
      const entries = Object.values(archive.files).filter(entry => !entry.dir);
      expect(entries.map(entry => entry.name)).toEqual(["leesfield-image-001.png", "leesfield-image-002.png"]);
      for (const [index, entry] of entries.entries()) {
        expect(createHash("sha256").update(await entry.async("nodebuffer")).digest("hex")).toBe(digestByNode.get(visibleOrder[index]));
      }
      await expect(button).toBeEnabled();
      expect((await readWorkflowViaApi(page, graph.id)).nodes).toEqual(saved.nodes);
      await captureEvidenceScreenshot(page, test.info(), "t28-selected-image-zip");
      expect(errors).toEqual([]);
    } finally {
      await deleteWorkflowViaApi(page, graph.id);
    }
  });

  test("image port creates video and assistant with automatic compatible models atomically", { tag: ["@spaces-canvas", "@spaces-generation", "@spaces-assistant"] }, async ({ page }, testInfo) => {
    const graph = await createWorkflowViaApi(page), sourceId = fixtureId(graph, "connected-source");
    const original = (await (await page.request.get("/api/spaces/preferences")).json()).preferences;
    const setDefaults = async defaults => {
      const current = (await (await page.request.get("/api/spaces/preferences")).json()).preferences;
      expect((await page.request.patch("/api/spaces/preferences", { data: { action: "defaults", expectedRevision: current.revision, defaults } })).ok()).toBeTruthy();
    };
    let submissions = 0;
    const observe = request => { if (request.method() === "POST" && /\/executions(?:\?|$)|\/api\/(?:image|video|audio)-generation/.test(new URL(request.url()).pathname)) submissions++; };
    page.on("request", observe);
    try {
      await setDefaults({});
      for (const [kind, label, type] of [["generate.video", "Generate Video", "video"], ["generate.assistant", "AI Assistant", "llm"]]) {
        await replaceWorkflowViaApi(page, graph.id, [{ id: sourceId, kind: "input.image", configVersion: 1, config: { assetId: null }, position: { x: 0, y: 0 }, selectedOutputAssetId: null }]);
        await waitForFreshWorkflow(page, graph); await fitCanvas(page);
        const source = page.locator(`.react-flow__node[data-id="${sourceId}"]`), icon = source.locator('.source[data-space-port="image"][data-visible="true"]');
        await source.hover();
        const box = await icon.boundingBox(), start = await exposedHandlePoint(page, box, "source");
        expect(start).toBeTruthy();
        const end = await page.locator("[data-space-canvas]").evaluate(canvas => {
          const box = canvas.getBoundingClientRect();
          for (let y = box.y + 90; y < box.bottom - 80; y += 70) for (let x = box.x + 20; x < box.right - 20; x += 50) {
            const hit = document.elementFromPoint(x, y);
            if (hit?.closest(".react-flow__pane") && !hit.closest(".react-flow__node")) return { x, y };
          }
          return null;
        });
        expect(end).toBeTruthy();
        await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 12 }); await page.mouse.up();
        const menu = page.locator("[data-space-node-menu]"); await expect(menu).toBeVisible();
        await menu.getByRole("option", { name: label, exact: true }).click();
        const model = await activeModel(page, type, item => type === "llm" ? item.providerConfig.supports_images : item.meta.supports_init_image);
        await expect(page.getByRole("dialog", { name: "Browse Models", exact: true })).toHaveCount(0);
        const saved = await waitForWorkflowState(page, graph.id, value => value.nodes.length === 2 && value.edges.length === 1, "connected model creation was not saved");
        const target = saved.nodes.find(node => node.kind === kind);
        expect(target.config.modelKey).toBe(model.key);
        expect(saved.edges[0]).toMatchObject({ sourceNodeId: sourceId, sourcePortId: "image", targetNodeId: target.id,
          targetPortId: kind === "generate.video" ? "initImage" : "images", sortOrder: 0 });
        await page.locator("[data-space-canvas]").focus(); await page.keyboard.press("ControlOrMeta+z");
        await waitForWorkflowState(page, graph.id, value => value.nodes.length === 1 && value.edges.length === 0, "connected undo was not atomic");
        await page.keyboard.press("ControlOrMeta+Shift+z");
        await waitForWorkflowState(page, graph.id, value => value.nodes.length === 2 && value.edges.length === 1, "connected redo was not atomic");
        await page.reload(); await waitForFreshWorkflow(page, graph, false);
        expect((await readWorkflowViaApi(page, graph.id)).edges).toEqual(saved.edges);
        await captureEvidenceScreenshot(page, testInfo, "connected-" + type);
      }
      expect(submissions).toBe(0);
    } finally { page.off("request", observe); await setDefaults(original.defaults); await deleteWorkflowViaApi(page, graph.id); }
  });

  test("port actions upload or select source assets and connect atomically", { tag: ["@spaces-canvas", "@spaces-media"] }, async ({ page }, testInfo) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    const resizeId = `reference-${graph.id}`;
    try {
      await replaceWorkflowViaApi(page, graph.id, [{ id: resizeId, kind: "input.image", configVersion: 1, config: { assetId: null }, position: { x: 400, y: 100 }, selectedOutputAssetId: null }]);
      await waitForFreshWorkflow(page, graph);
      const resize = page.locator(`.react-flow__node[data-id="${resizeId}"]`);
      await resize.click({ position: { x: 80, y: 20 } });
      const port = resize.locator('.target[data-space-port="reference"][data-visible="true"]');
      await expect(port).toHaveAttribute("data-space-port", "reference");
      await port.click();
      const menu = page.locator('[data-space-node-menu]');
      await expect(menu.getByRole("option", { name: "Assets", exact: true })).toBeVisible();
      await captureEvidenceScreenshot(page, testInfo, "t36-port-menu");
      await menu.getByRole("option", { name: "Assets", exact: true }).click();
      const assets = page.getByRole("dialog", { name: "Assets", exact: true });
      for (const [name, category] of [["Generated", "generated"], ["Edited", "edited"], ["Uploads", "uploads"]]) {
        const requested = category === "uploads" ? null : page.waitForResponse(response => new URL(response.url()).pathname === "/api/media-assets" && new URL(response.url()).searchParams.get("category") === category, { timeout: 45_000 });
        await assets.getByRole("tab", { name, exact: true }).click();
        if (requested) expect((await requested).ok()).toBe(true);
        await expect(assets.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
      }
      await captureEvidenceScreenshot(page, testInfo, "t36-asset-sources");
      await assets.getByRole("button", { name: "Close assets" }).click();
      expect((await readWorkflowViaApi(page, graph.id)).nodes).toHaveLength(1);
      await port.click();
      const chooser = page.waitForEvent("filechooser");
      await menu.getByRole("option", { name: "Upload", exact: true }).click();
      await (await chooser).setFiles({ name: "t36-input.png", mimeType: "image/png", buffer: deterministicPng(40, 32) });
      const uploaded = await waitForWorkflowState(page, graph.id, snapshot => snapshot.nodes.length === 2 && snapshot.edges.length === 1, "port upload did not connect");
      const input = uploaded.nodes.find(node => node.id !== resizeId);
      expect(input.config.assetId).toEqual(expect.any(String));
      await page.locator('[data-space-canvas]').focus();
      await page.keyboard.press("ControlOrMeta+z");
      await waitForWorkflowState(page, graph.id, snapshot => snapshot.nodes.length === 1 && snapshot.edges.length === 0, "node and edge were not one Undo");
      await port.click();
      await menu.getByRole("option", { name: "Assets", exact: true }).click();
      await searchAssets(page, assets, input.config.assetId);
      await expect(assets.locator('article > button[aria-pressed]')).toHaveCount(1, { timeout: 45_000 });
      await expect(assets.locator('article > button[aria-pressed] img')).toBeVisible();
      await captureEvidenceScreenshot(page, testInfo, "t36-assets-ready");
      await assets.locator('article > button[aria-pressed]').click();
      await expect(assets).toBeHidden();
      const selected = await waitForWorkflowState(page, graph.id, snapshot => snapshot.nodes.length === 2 && snapshot.edges.length === 1, "asset selection did not connect");
      const selectedInput = selected.nodes.find(node => node.id !== resizeId);
      expect(selectedInput.config.assetId).toBe(input.config.assetId);
      await fitCanvas(page);
      const inputNode = page.locator(`.react-flow__node[data-id="${selectedInput.id}"]`);
      const inputPort = inputNode.locator('.source[data-space-port="image"][data-visible="true"]');
      await expect(inputNode.getByRole('button', { name: /^(Assets|Replace)$/ })).toHaveCount(0);
      await inputPort.click();
      await expect(menu.getByRole('option', { name: 'Upload', exact: true })).toBeVisible();
      await menu.getByRole('option', { name: 'Assets', exact: true }).click();
      await assets.getByRole('button', { name: 'Close assets' }).click();
      expect((await readWorkflowViaApi(page, graph.id)).nodes).toHaveLength(2);
      await inputPort.click();
      const replacementChooser = page.waitForEvent('filechooser');
      await menu.getByRole('option', { name: 'Upload', exact: true }).click();
      await (await replacementChooser).setFiles({ name: 't39-replace.png', mimeType: 'image/png', buffer: deterministicPng(48, 36) });
      const replaced = await waitForWorkflowState(page, graph.id, snapshot => snapshot.nodes.find(node => node.id === selectedInput.id)?.config.assetId !== input.config.assetId, 'input menu upload did not replace');
      expect(replaced.nodes).toHaveLength(2);
      expect(replaced.edges).toHaveLength(1);
      await inputPort.click();
      await menu.getByRole('option', { name: 'Assets', exact: true }).click();
      await searchAssets(page, assets, input.config.assetId);
      await expect(assets.locator('article > button[aria-pressed]')).toHaveCount(1, { timeout: 45_000 });
      await assets.locator('article > button[aria-pressed]').click();
      await waitForWorkflowState(page, graph.id, snapshot => snapshot.nodes.length === 2 && snapshot.edges.length === 1 && snapshot.nodes.find(node => node.id === selectedInput.id).config.assetId === input.config.assetId, 'input menu assets did not replace');
      await page.reload();
      await waitForFreshWorkflow(page, graph, false);
      expect((await readWorkflowViaApi(page, graph.id)).edges).toHaveLength(1);
      await expect(page.getByRole("button", { name: "History assets", exact: true })).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally { await deleteWorkflowViaApi(page, graph.id); }
  });

  test("Spaces list creates, copies, deletes and returns through the Leesfield brand header", { tag: ["@spaces-canvas", "@spaces-smoke"] }, async ({ page }) => {
    const errors = attachErrorCapture(page);
    const ids = [];
    let title = `Spaces lifecycle ${test.info().project.name} ${Date.now()}`;
    try {
      const before = (await (await page.request.get("/api/generation-graphs")).json()).graphs;
      await page.goto("/spaces", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Spaces", exact: true })).toBeVisible();
      await expect(page.locator('[data-app-brand-logo]')).toBeVisible();
      await expect(page.locator('[data-space-canvas]')).toHaveCount(0);
      const after = (await (await page.request.get("/api/generation-graphs")).json()).graphs;
      expect(after.map((graph) => graph.id).sort()).toEqual(before.map((graph) => graph.id).sort());
      await page.getByRole("button", { name: /^New space$/i }).click();
      const dialog = page.getByRole("dialog");
      await fillEditor(dialog.getByRole("textbox", { name: "Space name" }), title);
      const created = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/generation-graphs");
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      const graph = (await (await created).json()).graph; ids.push(graph.id);
      // The first detail route compiles the native canvas in the dev server.
      await expect(page).toHaveURL(new RegExp(`/spaces/${graph.id}$`), { timeout: 30_000 });
      await expect(page.locator('[data-space-canvas]')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('[data-app-brand-logo]')).toContainText("leesfield");
      const header = page.locator('[data-space-workspace-header]');
      const headerBounds = await header.boundingBox();
      const markBounds = await header.locator('[data-app-brand-logo] > span:first-child').boundingBox();
      expect(Math.abs((markBounds.y - headerBounds.y) - (headerBounds.y + headerBounds.height - markBounds.y - markBounds.height))).toBeLessThanOrEqual(2);
      await expect(header.getByText("|", { exact: true })).toHaveCount(0);
      await captureEvidenceScreenshot(page, test.info(), "t35-header-alignment");
      await header.getByRole("button", { name: "Open space", exact: true }).click();
      const spacesDialog = page.getByRole("dialog", { name: "Spaces", exact: true });
      await expect(spacesDialog).toBeVisible();
      const bounds = await spacesDialog.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width);
      expect(await spacesDialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      const footerButtons = await spacesDialog.locator("footer button").all();
      for (let index = 1; index < footerButtons.length; index += 1) {
        const previous = await footerButtons[index - 1].boundingBox();
        const next = await footerButtons[index].boundingBox();
        expect(next.y >= previous.y + previous.height || next.x >= previous.x + previous.width + 4).toBe(true);
      }
      await expect(spacesDialog.locator('[aria-current="page"]')).toContainText(title);
      await captureEvidenceScreenshot(page, test.info(), "t35-open-space-modal");
      await spacesDialog.getByRole("button", { name: "New space", exact: true }).click();
      const newSpaceDialog = page.getByRole("dialog", { name: "New space", exact: true });
      await expect(newSpaceDialog.getByRole("textbox", { name: "Space name" })).toBeVisible();
      await captureEvidenceScreenshot(page, test.info(), "t35-new-space-form");
      await newSpaceDialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await spacesDialog.getByRole("button", { name: "Close", exact: true }).click();
      await expect(spacesDialog).toHaveCount(0);
      const back = page.getByRole("button", { name: "Back to Spaces" });
      await expect(back).toBeVisible();
      await back.click();
      await expect(page).toHaveURL(/\/spaces$/);
      await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
      await page.getByRole("button", { name: `Rename ${title}`, exact: true }).click();
      title += " renamed";
      await fillEditor(page.getByRole("dialog").getByRole("textbox", { name: "Space name" }), title);
      await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect((await (await page.request.get(`/api/generation-graphs/${graph.id}`)).json()).graph.title).toBe(title);
      const copied = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/generation-graphs/${graph.id}/copy`);
      await page.getByRole("button", { name: `Duplicate ${title}`, exact: true }).click();
      const copyResponse = await copied; expect(copyResponse.ok()).toBeTruthy();
      const copy = (await copyResponse.json()).graph; ids.push(copy.id);
      expect(copy.id).not.toBe(graph.id);
      await expect(page.getByRole("link", { name: new RegExp(`${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(Copy\\)`) })).toBeVisible();
      await page.reload();
      await page.getByRole("button", { name: `Delete ${copy.title}`, exact: true }).click();
      await expect(page.getByRole("dialog")).toContainText("generation history will be kept");
      await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
      await expect(page.getByRole("button", { name: `Delete ${copy.title}`, exact: true })).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect((await page.request.get(`/api/generation-graphs/${copy.id}`)).status()).toBe(404);
      expect((await page.request.get(`/api/generation-graphs/${graph.id}`)).ok()).toBeTruthy();
      await captureEvidenceScreenshot(page, test.info(), "spaces-list-lifecycle");
      expect(errors, errors.join("\n")).toEqual([]);
    } finally { for (const id of ids) await deleteWorkflowViaApi(page, id); }
  });

  test("real pointer marquee and drag remain bounded and persist a graph change", { tag: "@spaces-canvas" }, async ({ page }) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await page.addInitScript(() => {
      if (window.top !== window || location.protocol !== "http:") return;
        window.localStorage.setItem("node-studio.canvas-settings", JSON.stringify({
          panMode: "space",
          zoomMode: "altScroll",
          selectionMode: "shiftDrag",
        }));
      });
      await waitForFreshWorkflow(page, graph);

      const canvas = page.locator('[data-space-canvas]');
      await addNodeFromToolbar(page, "Image");
      const first = canvas.locator(".react-flow__node").nth(0);
      await expect(first).toHaveCount(1);
      const viewport = page.viewportSize();
      const firstDistance = (viewport?.width ?? 0) < 600 ? { x: 0, y: -160 } : { x: -420, y: 0 };
      const secondDistance = (viewport?.width ?? 0) < 600 ? { x: 0, y: 160 } : { x: 260, y: 0 };
      await dragNodeByBody(page, first, firstDistance);
      await addNodeFromToolbar(page, "Prompt");
      const nodes = canvas.locator(".react-flow__node");
      await expect(nodes).toHaveCount(2, { timeout: 10_000 });
      const beforeSecondDrag = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) => node.kind === "input.prompt"),
        "prompt node was not persisted before the drag regression exercise",
      );
      const promptBeforeDrag = beforeSecondDrag.nodes.find((node) => node.kind === "input.prompt");
      expect(promptBeforeDrag).toBeTruthy();
      if (!promptBeforeDrag) throw new Error("Prompt node is missing before drag");

      const secondBefore = await nodes.nth(1).boundingBox();
      if (!secondBefore) throw new Error("ReactFlow node has no box");
      await dragNodeByBody(page, nodes.nth(1), secondDistance);

      const movedBox = await nodes.nth(1).boundingBox();
      expect(movedBox).not.toBeNull();
      expect(Math.abs((movedBox?.x ?? 0) - secondBefore.x) + Math.abs((movedBox?.y ?? 0) - secondBefore.y)).toBeGreaterThan(0);

      const beforeMarquee = await waitForWorkflowState(page, graph.id, (snapshot) =>
        JSON.stringify(snapshot.nodes.find((node) => node.id === promptBeforeDrag.id)?.position) !== JSON.stringify(promptBeforeDrag.position),
      "Node drag must persist before marquee-only checks");

      await fitCanvas(page);
      const canvasBox = await canvas.boundingBox();
      if (!canvasBox) throw new Error("WorkflowCanvas has no box");
      for (let repeat = 0; repeat < 3; repeat += 1) {
        // After selection the marquee origin can be inside React Flow's group
        // drag overlay. Clear selection on the real pane before repeating.
        const clearPoint = { x: canvasBox.x + 8, y: canvasBox.y + 8 };
        expect(await page.evaluate(({ x, y }) =>
          document.elementFromPoint(x, y)?.classList.contains("react-flow__pane"), clearPoint,
        )).toBe(true);
        await page.mouse.click(clearPoint.x, clearPoint.y);
        await expect(canvas.locator(".react-flow__node.selected")).toHaveCount(0);
        await expect(page.locator('[data-space-selection-toolbar]')).toHaveCount(0);
        // Edge auto-pan can shift the viewport during a successful marquee.
        // Reusing its old origin can hit a floating node header on the next
        // iteration even though the clear point is still on the pane.
        await fitCanvas(page);
        const nodeBoxes = await Promise.all([nodes.nth(0).boundingBox(), nodes.nth(1).boundingBox()]);
        const minLeft = Math.min(...nodeBoxes.map((box) => box?.x ?? canvasBox.x));
        const minTop = Math.min(...nodeBoxes.map((box) => box?.y ?? canvasBox.y));
        const maxRight = Math.max(...nodeBoxes.map((box) => box ? box.x + box.width : canvasBox.x));
        const maxBottom = Math.max(...nodeBoxes.map((box) => box ? box.y + box.height : canvasBox.y));
        const selectionStart = {
          x: Math.max(canvasBox.x + 2, minLeft - 12),
          y: Math.max(canvasBox.y + 2, minTop - 12),
        };
        const selectionEnd = {
          x: Math.min(canvasBox.x + canvasBox.width - 2, maxRight + 12),
          y: Math.min(canvasBox.y + canvasBox.height - 2, maxBottom + 12),
        };
        expect(await page.evaluate(({ x, y }) =>
          document.elementFromPoint(x, y)?.classList.contains("react-flow__pane"), selectionStart,
        ), "marquee must start on the pane, not a floating node header").toBe(true);
        await page.keyboard.down("Shift");
        await page.waitForTimeout(100);
        await page.mouse.move(selectionStart.x, selectionStart.y);
        await page.mouse.down();
        for (let step = 1; step <= 64; step += 1) {
          await page.mouse.move(
            selectionStart.x + ((selectionEnd.x - selectionStart.x) * step) / 64,
            selectionStart.y + ((selectionEnd.y - selectionStart.y) * step) / 64,
            { steps: 1 },
          );
        }
        await page.mouse.up();
        await page.keyboard.up("Shift");
        await expect(canvas.locator(".react-flow__node.selected")).toHaveCount(2);
        await expect(page.locator('[data-space-selection-toolbar]')).toBeVisible();
      }
      await expect(page.getByRole("status", { name: "Saved" })).toBeVisible().catch(() => undefined);
      const saved = await page.request.get(`/api/generation-graphs/${encodeURIComponent(graph.id)}`);
      expect(saved.ok(), `reload snapshot failed: ${saved.status()}`).toBeTruthy();
      const snapshot = await saved.json();
      expect(snapshot.graph.nodes).toHaveLength(2);
      for (const node of beforeMarquee.nodes) {
        expect(snapshot.graph.nodes.find((savedNode) => savedNode.id === node.id)?.position).toEqual(node.position);
      }
      const promptAfterDrag = snapshot.graph.nodes.find((node) => node.id === promptBeforeDrag.id);
      expect(promptAfterDrag?.position).not.toEqual(promptBeforeDrag.position);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator('[data-space-canvas] .react-flow__node')).toHaveCount(2, { timeout: 15_000 });
      const reloaded = await readWorkflowViaApi(page, graph.id);
      expect(reloaded.nodes.find((node) => node.id === promptBeforeDrag.id)?.position).toEqual(promptAfterDrag.position);
      await captureEvidenceScreenshot(page, test.info(), "pointer-reload");
      expect(errors, errors.join("\n")).toEqual([]);
    } finally {
      await deleteWorkflowViaApi(page, graph.id);
    }
  });

  test("real generation Run submits image/audio/video jobs, projects durable outputs, and reloads", { tag: ["@desktop", "@spaces-generation", "@spaces-media"] }, async ({ page }, testInfo) => {
    test.setTimeout(240_000);

    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await waitForFreshWorkflow(page, graph);
      const canvas = page.locator('[data-space-canvas]');
      const bottomRun = page.locator('[data-space-floating-bar]').getByRole("button", { name: "Run", exact: true });
      const executionStarts = [];
      page.on("request", request => {
        const pathname = new URL(request.url()).pathname;
        if (request.method() === "POST" && /^\/api\/generation-graphs\/[^/]+\/nodes\/[^/]+\/executions$/.test(pathname)) executionStarts.push(pathname);
      });
      for (const label of ["Generate Image", "Generate Audio", "Generate Video"]) {
        await addNodeFromAllNodes(page, label);
      }
      await addNodeFromToolbar(page, "Image");
      await addNodeFromToolbar(page, "Output");
      await addNodeFromToolbar(page, "Output");
      await addNodeFromToolbar(page, "Output");
      await expect(canvas.locator(".react-flow__node")).toHaveCount(7, { timeout: 15_000 });

      const created = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => ["input.image", "generate.image", "generate.audio", "generate.video"].every((kind) => snapshot.nodes.some((node) => node.kind === kind)) &&
          snapshot.nodes.filter((node) => node.kind === "output.single").length === 3,
        "generation and downstream Output nodes were not persisted",
        45_000,
      );
      const outputRecords = created.nodes.filter(node => node.kind === "output.single");
      const generationKinds = ["generate.image", "generate.audio", "generate.video"];
      let outputIndex = 0;
      const laidOut = created.nodes.map((node) => {
        const generationIndex = generationKinds.indexOf(node.kind);
        if (generationIndex >= 0) {
          return { ...node, position: { x: 0, y: generationIndex * 760 } };
        }
        if (node.kind === "input.image") {
          return { ...node, position: { x: -720, y: 2 * 760 } };
        }
        if (node.kind === "output.single") {
          const position = { x: 720, y: outputIndex * 760 };
          outputIndex += 1;
          return { ...node, position };
        }
        return node;
      });
      await replaceWorkflowViaApi(page, graph.id, laidOut, created.edges);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(canvas.locator(".react-flow__node")).toHaveCount(7, { timeout: 15_000 });
      const runCases = await generationCases(page);
      const generationRecordFor = (kind) => {
        const record = created.nodes.find((node) => node.kind === kind);
        if (!record) throw new Error(`missing ${kind}`);
        return record;
      };
      const generationNodeFor = (label) => nodeBody(page, label)
        .locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' react-flow__node ')][1]")
        .first();
      // Snapshot enumeration and DOM order can differ on equal creation times.
      // Pin preparation, pointer connections and assertions to the same IDs.
      const outputNodeFor = index => canvas.locator(`.react-flow__node[data-id="${outputRecords[index].id}"]`);
      await fitCanvas(page);

      for (const item of runCases) {
        const record = generationRecordFor(item.kind);
        const body = nodeBody(page, item.label);
        await expect(body).toBeVisible();
        await selectNodeFromHeader(body);
        const header = page.locator(
          `[data-space-node-header="${record.id}"]`,
        );
        await expect(header).toBeVisible();
        await header.getByRole("button", { name: "Browse models" }).click();
        const dialog = page.getByRole("dialog", { name: "Browse Models" });
        await expect(dialog).toBeVisible();
        await modelCard(page, dialog, item.modelKey).click();
        await expect(dialog).toBeHidden();
        await waitForWorkflowState(
          page,
          graph.id,
          (snapshot) => snapshot.nodes.some((node) => node.id === record.id && node.config?.modelKey === item.modelKey),
          `${item.kind} model selection was not persisted before Run`,
        );
        const prompt = body.getByRole("textbox", { name: "Prompt" });
        await fillEditor(prompt, item.prompt);
        await prompt.blur();
        await waitForWorkflowState(
          page,
          graph.id,
          (snapshot) => snapshot.nodes.some((node) => node.id === record.id && node.config?.prompt === item.prompt),
          `${item.kind} prompt was not persisted before Run`,
        );

        if (item.kind === "generate.video") {
          const imageInputBody = nodeBody(page, "Image Input");
          await uploadInputMedia(imageInputBody, {
            name: "t25-video-init.png",
            mimeType: "image/png",
            buffer: deterministicPng(40, 32, 1),
          });
          await expect(imageInputBody.locator("img")).toBeVisible({ timeout: 30_000 });
          const imageInputNode = reactFlowNodeForArticle(page, "Image Input");
          const videoNode = generationNodeFor("Generate Video");
          await fitCanvas(page);
          await connectHandles(page, imageInputNode, videoNode, "image", "image");
          await waitForWorkflowState(
            page,
            graph.id,
            (snapshot) => snapshot.edges.some((edge) => edge.targetNodeId === record.id && edge.targetPortId === "initImage"),
            "video initialization image was not connected before readiness coverage",
          );
          // Exercise the user-visible invalid state before restoring a valid
          // prompt. The reason must name the missing prompt, not merely expose
          // a generic disabled button.
          await fillEditor(prompt, "");
          await prompt.blur();
          await waitForWorkflowState(
            page,
            graph.id,
            (snapshot) => snapshot.nodes.some((node) => node.id === record.id && typeof node.config?.prompt === "string" && !node.config.prompt.trim()),
            "video prompt clear was not persisted for invalid-readiness coverage",
          );
          await selectNodeFromHeader(body);
          const unavailable = header.getByRole("button", { name: "Run node unavailable: Add a prompt or connect a Prompt node." });
          await expect(unavailable).toBeDisabled();
          await expect(unavailable).toHaveAttribute("title", "Run node unavailable: Add a prompt or connect a Prompt node.");
          await expect(bottomRun).toBeVisible();
          await expect(bottomRun).toBeDisabled();
          await fillEditor(prompt, item.prompt);
          await prompt.blur();
          await waitForWorkflowState(
            page,
            graph.id,
            (snapshot) => snapshot.nodes.some((node) => node.id === record.id && node.config?.prompt === item.prompt),
            "video prompt restore was not persisted before Run",
          );
        }
      }

      for (const [index, item] of runCases.entries()) {
        const source = generationNodeFor(item.label);
        const output = outputNodeFor(index);
        await connectHandles(page, source, output, item.mediaType, item.mediaType);
      }
      const connected = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => {
          const outputNodeIds = new Set(outputRecords.map((node) => node.id));
          const outputEdges = snapshot.edges.filter((edge) => outputNodeIds.has(edge.targetNodeId));
          return outputEdges.length === 3 &&
            outputEdges.every((edge) => edge.targetPortId === edge.sourcePortId) &&
            runCases.every((item, index) => outputEdges.some(edge =>
              edge.sourceNodeId === generationRecordFor(item.kind).id && edge.targetNodeId === outputRecords[index].id &&
              edge.sourcePortId === item.mediaType && edge.targetPortId === item.mediaType)) &&
            snapshot.edges.some((edge) => edge.targetNodeId === generationRecordFor("generate.video").id && edge.targetPortId === "initImage");
        },
        "generation outputs were not connected to their downstream Output nodes",
        30_000,
      );
      expect(connected.nodes.filter((node) => node.kind === "output.single")).toHaveLength(3);

      const generatedAssets = [];
      for (const [index, item] of runCases.entries()) {
        const record = generationRecordFor(item.kind);
        const body = nodeBody(page, item.label);
        await selectNodeFromHeader(body);
        const header = page.locator(
          `[data-space-node-header="${record.id}"]`,
        );
        await expect(canvas.locator(".react-flow__node.selected")).toHaveCount(1);
        await expect(bottomRun).toBeEnabled();
        const started = await runHostedGeneration(page, graph.id, record.id, header, 60_000, index === 0 ? bottomRun : undefined);
        expect(executionStarts).toEqual(runCases.slice(0, index + 1).map(item =>
          `/api/generation-graphs/${encodeURIComponent(graph.id)}/nodes/${encodeURIComponent(generationRecordFor(item.kind).id)}/executions`));
        expect(started.outputAssetIds).toHaveLength(1);
        const assetId = started.outputAssetIds[0];
        const assetResponse = await page.request.get(`/api/media-assets/${encodeURIComponent(assetId)}`);
        expect(assetResponse.ok(), `generated ${item.mediaType} asset read failed: ${assetResponse.status()}`).toBeTruthy();
        const assetPayload = await assetResponse.json();
        expect(assetPayload.asset).toMatchObject({ id: assetId, type: item.mediaType, origin: "generation", status: "completed" });
        expect(new URL(assetPayload.asset.url, page.url()).protocol).toMatch(/^https?:$/);
        const digest = await mediaAssetDigest(page, assetId);
        generatedAssets.push({ item, record, assetId, digest, outputRecord: outputRecords[index] });
        const durable = await waitForWorkflowState(
          page,
          graph.id,
          (snapshot) => snapshot.nodes.some((node) => node.id === record.id && node.selectedOutputAssetId === assetId),
          `${item.kind} completed asset was not selected on the durable node`,
          30_000,
        );
        expect(durable.nodes.find((node) => node.id === record.id)?.selectedOutputAssetId).toBe(assetId);
        const result = await resultInput(page, graph.id, record.id, started, item.mediaType);
        generatedAssets.at(-1).result = result;
        expect(result.kind).toBe(`input.${item.mediaType}`);
        expect(result.config.assetId).toBe(assetId);
        await expectMedia(page, result, assetId, item.mediaType);
        // The generating node retains its source form; media lives in the result Input.
        await expect(body.locator("[data-space-audio-waveform], video")).toHaveCount(0);
        await expectEditorText(body.getByRole("textbox", { name: "Prompt" }), item.prompt);
        await expectMedia(page, outputRecords[index], assetId, item.mediaType);
        const outputResponse = await page.request.get(
          `/api/generation-graphs/${encodeURIComponent(graph.id)}/nodes/${encodeURIComponent(outputRecords[index].id)}/outputs`,
        );
        expect(outputResponse.ok(), `downstream ${item.mediaType} Output resolve failed: ${outputResponse.status()}`).toBeTruthy();
        expect((await outputResponse.json()).output.groups).toEqual([
          expect.objectContaining({ portId: item.mediaType, assets: [expect.objectContaining({ id: assetId })] }),
        ]);
      }

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(canvas).toBeVisible({ timeout: 15_000 });
      await fitCanvas(page);
      for (const { item, record, assetId, digest, result } of generatedAssets) {
        await expectMedia(page, result, assetId, item.mediaType);
        await expectEditorText(nodeBody(page, item.label).getByRole("textbox", { name: "Prompt" }), item.prompt);
        const restored = await readWorkflowViaApi(page, graph.id);
        expect(restored.nodes.find(node => node.id === record.id)?.selectedOutputAssetId).toBe(assetId);
        expect(restored.nodes.find(node => node.id === result.id)?.config).toEqual(result.config);
        expect(await mediaAssetDigest(page, assetId)).toBe(digest);
      }
      for (const [index, item] of runCases.entries()) {
        await expectMedia(page, outputRecords[index], generatedAssets[index].assetId, item.mediaType);
      }
      await captureEvidenceScreenshot(page, testInfo, "generation-run-output-reload");
      expect(errors, errors.join("\n")).toEqual([]);
    } finally {
      await deleteWorkflowViaApi(page, graph.id);
    }
  });

  test("Image Input history modal selects a durable asset and restores focus for close, Download, and X", { tag: "@spaces-media" }, async ({ page }, testInfo) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await waitForFreshWorkflow(page, graph);
      const canvas = page.locator('[data-space-canvas]');
      await addNodeFromToolbar(page, "Image");
      const firstBody = canvas.locator('[data-space-node="input.image"]').nth(0);
      await uploadInputMedia(firstBody, {
        name: "t25-history-first.png",
        mimeType: "image/png",
        buffer: deterministicPng(40, 32, 0),
      });
      await expect(firstBody.locator("img")).toBeVisible({ timeout: 30_000 });
      const firstUploaded = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) => node.kind === "input.image" && typeof node.config?.assetId === "string" && node.config.assetId.length > 0),
        "first history image did not persist",
        30_000,
      );
      const firstRecord = firstUploaded.nodes.find((node) => node.kind === "input.image");
      const firstAssetId = firstRecord?.config?.assetId;
      expect(firstAssetId).toEqual(expect.any(String));

      await addNodeFromToolbar(page, "Image");
      const imageBodies = canvas.locator('[data-space-node="input.image"]');
      await expect(imageBodies).toHaveCount(2, { timeout: 15_000 });
      const secondBody = imageBodies.nth(1);
      await uploadInputMedia(secondBody, {
        name: "t25-history-second.png",
        mimeType: "image/png",
        buffer: deterministicPng(40, 32, 1),
      });
      await expect(secondBody.locator("img")).toBeVisible({ timeout: 30_000 });
      const bothUploaded = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.filter((node) => node.kind === "input.image" && typeof node.config?.assetId === "string" && node.config.assetId.length > 0).length === 2,
        "second history image did not persist",
        30_000,
      );
      const secondRecord = bothUploaded.nodes.find((node) => node.kind === "input.image" && node.id !== firstRecord?.id);
      const secondAssetId = secondRecord?.config?.assetId;
      expect(secondAssetId).toEqual(expect.any(String));
      expect(secondAssetId).not.toBe(firstAssetId);

      const historyTrigger = secondBody.locator('.source[data-space-port="image"][data-visible="true"]');
      await historyTrigger.click();
      await page.locator('[data-space-node-menu]').getByRole('option', { name: 'Assets', exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Assets" });
      await expect(dialog).toBeVisible();
      const search = await openAssetsSearch(page, dialog);
      await expect(search).toBeFocused();
      await fillEditor(search, String(firstAssetId));
      await search.press("Escape");
      await expect(search).toBeHidden();
      await expect(dialog).toBeVisible();
      const matchingAsset = dialog.locator('article > button[aria-pressed]');
      await expect(matchingAsset).toHaveCount(1, { timeout: 30_000 });
      await expect(matchingAsset).toHaveAttribute("aria-pressed", "false");
      await matchingAsset.click();
      await expect(dialog).toBeHidden();
      await expect(page.locator('[data-space-canvas]')).toBeFocused();
      const selected = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) => node.id === secondRecord?.id && node.config?.assetId === firstAssetId),
        "history modal selection was not persisted to the second Image Input",
        30_000,
      );
      expect(selected.nodes.find((node) => node.id === secondRecord?.id)?.config?.assetId).toBe(firstAssetId);

      // Reopen and close through the actual dialog X. This proves the modal's
      // focus trap and return-focus contract independently of asset selection.
      await historyTrigger.click();
      await page.locator('[data-space-node-menu]').getByRole('option', { name: 'Assets', exact: true }).click();
      await expect(dialog).toBeVisible();
      await openAssetsSearch(page, dialog);
      await expect(search).toBeFocused();
      await dialog.getByRole("button", { name: "Close assets" }).click();
      await expect(dialog).toBeHidden();
      await expect(canvas).toBeFocused();

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(canvas).toBeVisible({ timeout: 15_000 });
      const reloadedSecond = canvas.locator(`.react-flow__node[data-id="${secondRecord?.id}"] [data-space-node="input.image"]`);
      await expect(reloadedSecond.locator("img")).toBeVisible({ timeout: 30_000 });
      const reloaded = await readWorkflowViaApi(page, graph.id);
      expect(reloaded.nodes.find((node) => node.id === secondRecord?.id)?.config?.assetId).toBe(firstAssetId);

      await selectNodeFromHeader(reloadedSecond);
      await reloadedSecond.hover();
      const download = reloadedSecond.getByRole("link", { name: "Download image" });
      await expect(download).toBeEnabled();
      const downloadEvent = page.waitForEvent("download");
      await download.click();
      await expect.poll(async () => (await downloadEvent).suggestedFilename(), { timeout: 10_000 }).toMatch(/\.(png|webp|jpeg)$/);
      const clear = reloadedSecond.getByRole("button", { name: "Remove image" });
      await expect(clear).toBeVisible();
      await clear.click();
      await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) => node.id === secondRecord?.id && node.config?.assetId === null),
        "Clear selected asset did not persist the Image Input X action",
        30_000,
      );
      await expect(reloadedSecond.getByRole("button", { name: "Remove image" })).toHaveCount(0);
      await expect(reloadedSecond.getByRole("button", { name: "Upload", exact: true })).toBeVisible();
      await expect(reloadedSecond.getByRole("button", { name: "Assets", exact: true })).toBeVisible();
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(canvas).toBeVisible({ timeout: 15_000 });
      const restored = await readWorkflowViaApi(page, graph.id);
      expect(restored.nodes.find((node) => node.id === secondRecord?.id)?.config?.assetId).toBeNull();
      await expect(canvas.locator('[data-space-node="input.image"]').nth(1).locator('input[type="file"]')).toBeAttached();
      await expect(reloadedSecond.getByRole("button", { name: "Upload", exact: true })).toBeVisible();
      await expect(reloadedSecond.getByRole("button", { name: "Assets", exact: true })).toBeVisible();
      await captureEvidenceScreenshot(page, testInfo, "image-history-modal-reload");
      expect(errors, errors.join("\n")).toEqual([]);
    } finally {
      await deleteWorkflowViaApi(page, graph.id);
    }
  });

  test("Video Generation connections render Frames and Output immediately and survive reload", { tag: ["@desktop", "@spaces-generation", "@spaces-media", "@spaces-capture", "@spaces-canvas"] }, async ({ page }) => {
    test.setTimeout(200_000);

    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await waitForFreshWorkflow(page, graph);
      for (const [label, position] of [
        ["Image Input", { x: 24, y: 180 }],
        ["Generate Video", { x: 400, y: 180 }],
        ["Video Frames", { x: 920, y: 180 }],
        ["Output", { x: 920, y: 600 }],
      ]) {
        await addNodeFromAllNodes(page, label);
        const node = reactFlowNodeForArticle(page, label);
        await expect(node).toBeVisible();
        await dragNodeToViewportPosition(page, node, position);
      }
      await fitCanvas(page);

      const imageInput = nodeBody(page, "Image Input");
      await uploadInputMedia(imageInput, {
        name: "video-connection-init.png",
        mimeType: "image/png",
        buffer: deterministicPng(40, 32, 1),
      });
      await expect(imageInput.locator("img")).toBeVisible({ timeout: 30_000 });
      const source = reactFlowNodeForArticle(page, "Generate Video");
      const stitch = reactFlowNodeForArticle(page, "Video Frames");
      const trim = reactFlowNodeForArticle(page, "Output");
      const sourceId = (await waitForWorkflowState(page, graph.id, (snapshot) =>
        snapshot.nodes.some((node) => node.kind === "generate.video"),
      "Video Generation was not saved")).nodes.find((node) => node.kind === "generate.video")?.id;
      expect(sourceId).toEqual(expect.any(String));
      const sourceBody = nodeBody(page, "Generate Video");
      await selectNodeFromHeader(sourceBody);
      const header = page.locator(`[data-space-node-header="${sourceId}"]`);
      await header.getByRole("button", { name: "Browse models" }).click();
      const dialog = page.getByRole("dialog", { name: "Browse Models" });
      const videoModel = await activeModel(page, "video", item => item.meta?.supports_init_image === true);
      await modelCard(page, dialog, videoModel.key).click();
      const prompt = sourceBody.getByRole("textbox", { name: "Prompt" });
      await fillEditor(prompt, "A short deterministic video clip");
      await prompt.blur();
      await waitForWorkflowState(page, graph.id, (snapshot) =>
        snapshot.nodes.some((node) => node.id === sourceId && node.config?.modelKey === videoModel.key && node.config?.prompt === "A short deterministic video clip"),
      "Video Generation model and prompt were not saved");
      await fitCanvas(page);
      await connectHandles(page, reactFlowNodeForArticle(page, "Image Input"), source, "image", "image");
      await waitForWorkflowState(page, graph.id, (snapshot) =>
        snapshot.edges.some((edge) => edge.targetNodeId === sourceId && edge.targetPortId === "initImage"),
      "Video Generation input was not saved");
      await selectNodeFromHeader(sourceBody);
      const completed = await runHostedGeneration(page, graph.id, sourceId, header, 120_000);
      expect(completed.outputAssetIds).toHaveLength(1);
      const generatedResult = await resultInput(page, graph.id, sourceId, completed, "video");
      await expectMedia(page, generatedResult, completed.outputAssetIds[0], "video");
      await expect(sourceBody.locator("video")).toHaveCount(0);

      await connectHandles(page, source, stitch, "video", "video");
      await expect(nodeBody(page, "Video Frames")).toBeVisible();
      await expect(page.getByText("The canvas could not be displayed")).toHaveCount(0);
      await connectHandles(page, source, trim, "video", "video");
      await expect(nodeBody(page, "Output")).toBeVisible();
      await expect(page.getByText("The canvas could not be displayed")).toHaveCount(0);

      const connected = await waitForWorkflowState(page, graph.id, (snapshot) => {
        const sourceId = snapshot.nodes.find((node) => node.kind === "generate.video")?.id;
        const stitchId = snapshot.nodes.find((node) => node.kind === "edit.video.extractFrames")?.id;
        const trimId = snapshot.nodes.find((node) => node.kind === "output.single")?.id;
        return snapshot.edges.some((edge) => edge.sourceNodeId === sourceId && edge.targetNodeId === stitchId) &&
          snapshot.edges.some((edge) => edge.sourceNodeId === sourceId && edge.targetNodeId === trimId);
      }, "Video Generation connections were not saved");
      expect(connected.edges).toHaveLength(4);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(nodeBody(page, "Video Frames")).toBeVisible();
      await expect(nodeBody(page, "Output")).toBeVisible();
      await expect(page.getByText("The canvas could not be displayed")).toHaveCount(0);
      expect(errors, errors.join("\n")).toEqual([]);
    } finally {
      await deleteWorkflowViaApi(page, graph.id);
    }
  });

  test("Unavailable edits reject new graphs while toolbar capture records an edited image and its source", { tag: ["@spaces-capture", "@spaces-media", "@spaces-canvas"] }, async ({ page }) => {
    const graph=await createWorkflowViaApi(page),errors=attachErrorCapture(page);
    try {
      await waitForFreshWorkflow(page,graph);
      for(const label of ["Image Resize", "Video Trim", "Video Stitch"]) {
        expect(await paletteHasNode(page,label)).toBe(false);
      }
      await addNodeFromAllNodes(page,"Video Input");
      const input=nodeBody(page,"Video Input");
      await uploadInputMedia(input,path.resolve("public/sample-video.mp4"));
      const uploaded=await waitForWorkflowState(page,graph.id,value=>value.nodes.some(n=>n.kind==="input.video"&&n.config.assetId),"Source video was not saved");
      const source=uploaded.nodes.find(n=>n.kind==="input.video");
      await selectNodeFromHeader(input);
      const video=input.locator("video");
      await expect.poll(()=>video.evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(2);
      await video.evaluate(v=>{v.pause();v.currentTime=0.5;});
      const capture=page.locator("[data-space-selection-toolbar]").getByRole("button",{name:"Capture frame",exact:true});
      await capture.click();await page.getByRole("menuitem",{name:"Capture current frame",exact:true}).click();
      const saved=await waitForWorkflowState(page,graph.id,value=>value.nodes.some(n=>n.kind==="input.image"&&n.config.assetId),"Capture was not saved",60000);
      const result=saved.nodes.find(n=>n.kind==="input.image");
      expect(result.config.resultSource).toMatchObject({nodeId:source.id,portId:"capturedFrame",state:"completed",executionId:null});
      expect(saved.edges).toContainEqual(expect.objectContaining({sourceNodeId:source.id,sourcePortId:"capturedFrame",targetNodeId:result.id,targetPortId:"reference"}));
      const assetResponse=await page.request.get("/api/media-assets/"+result.config.assetId),asset=(await assetResponse.json()).asset;
      expect(asset).toMatchObject({origin:"media_operation",type:"image",mimeType:"image/png",sourceOperationId:expect.any(String)});
      const historyResponse=await page.request.get("/api/history/"+asset.sourceOperationId+"?type=image&origin=edit&view=detail");
      expect(historyResponse.ok()).toBe(true);const history=await historyResponse.json();
      expect(history).toMatchObject({origin:"edit",operation:{type:"edit.video.frameGrab"},requestParameters:{timestampMs:500},
        inputMedia:[expect.objectContaining({assetId:source.config.assetId,type:"video"})]});
      await page.reload();await waitForFreshWorkflow(page,graph);
      await expectMedia(page,result,result.config.assetId,"image");
      expect((await readWorkflowViaApi(page,graph.id)).edges).toEqual(saved.edges);
      expect(errors,errors.join("\n")).toEqual([]);
    } finally { await deleteWorkflowViaApi(page,graph.id); }
  });

  test("Direct crop and trim create independent durable outputs with original sources and Edited history", { tag: ["@spaces-media", "@spaces-canvas", "@spaces-capture"] }, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const graph = await createWorkflowViaApi(page), errors = attachErrorCapture(page);
    try {
      await waitForFreshWorkflow(page, graph);
      await addNodeFromAllNodes(page, "Image Input");
      const image = nodeBody(page, "Image Input");
      await uploadInputMedia(image, { name: "direct-crop-source.png", mimeType: "image/png", buffer: deterministicPng(200, 100) });
      const imageGraph = await waitForWorkflowState(page, graph.id, g => g.nodes.some(n => n.kind === "input.image" && n.config.assetId), "Image source not saved");
      const imageSource = imageGraph.nodes.find(n => n.kind === "input.image");
      await selectNodeFromHeader(image);
      await page.locator("[data-space-selection-toolbar]").getByRole("button", { name: "More", exact: true }).click();
      await page.getByRole("menuitem", { name: "Crop image", exact: true }).click();
      await page.getByRole("button", { name: "Aspect ratio", exact: true }).click();
      await page.getByRole("menuitem", { name: "1:1", exact: true }).click();
      await expect(page.getByRole("menu")).toBeHidden();
      await page.keyboard.press("Escape");
      await expect(page.locator("[data-space-media-edit]")).toHaveCount(0);
      expect((await readWorkflowViaApi(page, graph.id)).nodes).toEqual(imageGraph.nodes);

      await addNodeFromAllNodes(page, "Video Input");
      await uploadInputMedia(nodeBody(page, "Video Input"), path.resolve("public/sample-video.mp4"));
      const uploaded = await waitForWorkflowState(page, graph.id, g => g.nodes.some(n => n.kind === "input.video" && n.config.assetId), "Video source not saved");
      const videoSource = uploaded.nodes.find(n => n.kind === "input.video");
      const originalDigests = new Map(await Promise.all([imageSource, videoSource].map(async source => [source.config.assetId, await mediaAssetDigest(page, source.config.assetId)])));
      for (const [kind, source, menu, confirm] of [
        ["image.crop", imageSource, "Crop image", "Confirm crop"],
        ["video.trim", videoSource, "Trim video", "Confirm trim"],
        ["video.crop", videoSource, "Crop video", "Create cropped video"],
      ]) {
        await fitCanvas(page);
        await selectNodeFromHeader(nodeById(page, source.id));
        await page.locator("[data-space-selection-toolbar]").getByRole("button", { name: "More", exact: true }).click();
        await page.getByRole("menuitem", { name: menu, exact: true }).click();
        const editor = page.locator("[data-space-media-edit]");
        await expect(editor).toHaveAttribute("data-space-media-edit", kind);
        if (kind === "image.crop") {
          await page.getByRole("button", { name: "Aspect ratio", exact: true }).click();
          await page.getByRole("menuitem", { name: "1:1", exact: true }).click();
        } else if (kind === "video.trim") {
          await editor.getByRole("toolbar").focus(); await page.keyboard.press("ArrowUp");
        }
        const acceptedResponse = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/media-edits"));
        await page.getByRole("button", { name: confirm, exact: true }).click();
        const response = await acceptedResponse;
        expect(response.ok(), await response.text()).toBe(true);
        const payload = await response.json(), operation = payload.operation;
        const request = response.request().postDataJSON();
        const saved = await waitForWorkflowState(page, graph.id, g => g.nodes.some(n =>
          n.id === operation.resultNodeId && n.config.resultSource?.state === "completed" && n.config.assetId), kind + " result not saved", 60_000);
        const result = saved.nodes.find(n => n.id === operation.resultNodeId), assetResponse = await page.request.get("/api/media-assets/" + result.config.assetId);
        const asset = (await assetResponse.json()).asset;
        expect(result.config.resultSource).toMatchObject({ nodeId: source.id, executionId: operation.id, state: "completed" });
        expect(saved.edges).toContainEqual(expect.objectContaining({ sourceNodeId: source.id, targetNodeId: result.id,
          sourcePortId: kind === "image.crop" ? "editedImage" : "editedVideo" }));
        expect(saved.nodes.find(n => n.id === source.id)).toEqual(source);
        expect(await mediaAssetDigest(page, source.config.assetId)).toBe(originalDigests.get(source.config.assetId));
        expect(asset).toMatchObject({ origin: "media_operation", sourceOperationId: operation.id, mimeType: kind === "image.crop" ? "image/png" : "video/mp4" });
        if (kind === "video.trim") expect(Math.abs(asset.durationMs - (request.edit.endMs - request.edit.startMs))).toBeLessThanOrEqual(150);
        else expect(asset).toMatchObject({ width: request.edit.rect.width, height: request.edit.rect.height });
        const history = await page.request.get("/api/history/" + operation.id + "?type=" + asset.type + "&origin=edit&view=detail");
        expect(history.ok()).toBe(true);
        expect(await history.json()).toMatchObject({ origin: "edit", operation: { type: "direct." + kind },
          inputMedia: [expect.objectContaining({ assetId: source.config.assetId })] });
        // The server may finish before the editor's observation GET returns.
        // Freeze a completed client result, rather than undoing a pending edit.
        await expectMedia(page, result, asset.id, asset.type);
        await page.locator("[data-space-canvas]").focus(); await page.keyboard.press("Control+z");
        await waitForWorkflowState(page, graph.id, g => !g.nodes.some(n => n.id === result.id), "Undo result not saved");
        await page.keyboard.press("Control+Shift+z");
        await waitForWorkflowState(page, graph.id, g => g.nodes.some(n => n.id === result.id && n.config.assetId === asset.id), "Redo frozen result not saved");
        await page.reload(); await waitForFreshWorkflow(page, graph, false);
        await expectMedia(page, result, asset.id, asset.type);
      }
      await fitCanvas(page); await captureEvidenceScreenshot(page, testInfo, "direct-crop-trim-results");
      expect(errors, errors.join("\n")).toEqual([]);
    } finally { await page.goto("about:blank"); await deleteWorkflowViaApi(page, graph.id); }
  });

  test("Video Frames extracts the selected playback position into one durable image", { tag: ["@desktop", "@spaces-capture", "@spaces-media"] }, async ({ page }, testInfo) => {
    const graph = await createWorkflowViaApi(page), errors = attachErrorCapture(page);
    try {
      await waitForFreshWorkflow(page, graph);
      await addNodeFromAllNodes(page, "Video Input");
      const input = nodeBody(page, "Video Input");
      await uploadInputMedia(input, path.resolve("public/sample-video.mp4"));
      await waitForWorkflowState(page, graph.id, value => value.nodes.some(node => node.kind === "input.video" && node.config.assetId), "Frames source upload was not saved");
      await addNodeFromAllNodes(page, "Video Frames");
      const frames = nodeBody(page, "Video Frames");
      await dragNodeByArticleBorder(page, reactFlowNodeForArticle(page, "Video Frames"), { x: 500, y: 0 });
      await fitCanvas(page);
      await connectHandles(page, reactFlowNodeForArticle(page, "Video Input"), reactFlowNodeForArticle(page, "Video Frames"), "video", "video");
      const connected = await waitForWorkflowState(page, graph.id, value => value.edges.length === 1, "Video Frames source connection was not saved");
      const id = connected.nodes.find(node => node.kind === "edit.video.extractFrames").id;
      await selectNodeFromHeader(frames);
      await activateNodeBody(frames);
      const head=frames.getByRole("slider",{name:"Playback position",exact:true});
      await expect(head).toHaveAttribute("aria-disabled","false");
      await head.focus();await head.press("Home");await head.press("ArrowRight");
      await waitForWorkflowState(page,graph.id,value=>value.nodes.find(n=>n.id===id)?.config.parameters.timestampMs===100,"Frame head was not saved");
      const execution = await runMediaOperation(page, graph.id, id, frames.locator("[data-space-node-header] [data-canvas-action=run]"));
      expect(execution.plan).toBeUndefined();
      expect(execution.outputBindings).toEqual([expect.objectContaining({portId:"frame",sortOrder:0,assetId:expect.any(String)})]);
      expect(execution.outputAssetIds).toHaveLength(1);
      const result=await resultInput(page,graph.id,id,execution,"frame");
      await expectMedia(page,result,result.config.assetId,"image");
      const results=[result];
      await expect(frames.getByRole("region", { name: "Operation source", exact: true }).locator("video")).toBeVisible();
      await page.reload(); await waitForFreshWorkflow(page, graph, false);
      const saved = await readWorkflowViaApi(page, graph.id);
      for (const result of results) {
        expect(saved.nodes.find(node => node.id === result.id)?.config).toEqual(result.config);
        await expectMedia(page, result, result.config.assetId, "image");
      }
      await captureEvidenceScreenshot(page, testInfo, "video-frames-result-bindings");
      expect(errors, errors.join("\n")).toEqual([]);
    } finally { await deleteWorkflowViaApi(page, graph.id); }
  });

  test("Korean IME composition keeps Delete and shortcuts inside Prompt editing", { tag: ["@desktop", "@spaces-prompt", "@spaces-canvas"] }, async ({ page, context }, testInfo) => {
    const graph = await createWorkflowViaApi(page), id = fixtureId(graph, "ime-prompt");
    const errors = attachErrorCapture(page);
    try {
      await replaceWorkflowViaApi(page, graph.id, [{ id, kind: "input.prompt", configVersion: 1,
        position: { x: 0, y: 0 }, config: { text: "" }, selectedOutputAssetId: null }]);
      await context.addCookies([{ name: "locale", value: "ko", url: testInfo.project.use.baseURL }]);
      await waitForCanvas(page, graph.id);
      const input = nodeById(page, id).locator("textarea");
      await activateEditor(input);
      const cdp = await context.newCDPSession(page);
      try {
        const text = "한글 조합 회귀";
        await cdp.send("Input.imeSetComposition", { text, selectionStart: text.length, selectionEnd: text.length });
        await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Delete", windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
        await expect(nodeById(page, id)).toBeVisible();
        await cdp.send("Input.insertText", { text });
        await expect(input).toHaveValue(text);
        await page.keyboard.press("Shift+i");
        const edited = await input.inputValue();
        await page.locator("[data-space-canvas]").focus();
        const saved = await waitForWorkflowState(page, graph.id, value => value.nodes[0]?.config.text === edited, "IME text was not saved");
        expect(saved.nodes).toHaveLength(1);
        await page.reload(); await waitForCanvas(page, graph.id, false);
        await expect(input).toHaveValue(edited);
        expect(errors, errors.join("\n")).toEqual([]);
      } finally { await cdp.detach(); }
    } finally { await deleteWorkflowViaApi(page, graph.id); }
  });

});
