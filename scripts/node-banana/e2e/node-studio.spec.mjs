import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";

import { test, expect } from "@playwright/test";

const WORKFLOW_PATH = "/spaces";
const E2E_TITLE_PREFIX = "T25 Chromium";

const SUPPORTED_NODE_CASES = [
  { kind: "process.promptConstructor", palette: "Prompt Constructor", title: "Prompt Constructor", component: "PromptConstructorNode", config: { template: "" } },
  { kind: "input.image", palette: "Image Input", title: "Image Input", component: "ImageInputNode", config: { assetId: null } },
  { kind: "input.audio", palette: "Audio Input", title: "Audio Input", component: "AudioInputNode", config: { assetId: null } },
  { kind: "input.video", palette: "Video Input", title: "Video Input", component: "VideoInputNode", config: { assetId: null } },
  { kind: "input.prompt", palette: "Prompt", title: "Prompt", component: "PromptNode", config: { text: "" } },
  { kind: "generate.image", palette: "Generate Image", title: "Generate Image", component: "GenerateImageNode", config: { prompt: "", modelKey: null, parameters: {} } },
  { kind: "generate.audio", palette: "Generate Audio", title: "Generate Audio", component: "GenerateAudioNode", config: { prompt: "", modelKey: null, parameters: {} } },
  { kind: "generate.video", palette: "Generate Video", title: "Generate Video", component: "GenerateVideoNode", config: { prompt: "", modelKey: null, parameters: {} } },
  { kind: "edit.image.annotation", palette: "Annotate", title: "Annotation", component: "AnnotationNode", config: { parameters: {} } },
  { kind: "edit.image.resize", palette: "Image Resize", title: "Image Resize", component: "ImageResizeNode", config: { parameters: {} } },
  { kind: "edit.image.removeBackground", palette: "Remove Background", title: "Remove Background", component: "RemoveBackgroundNode", config: { parameters: { model: "isnet_fp16" } }, capabilityGated: true },
  { kind: "edit.image.splitGrid", palette: "Split Grid", title: "Split Grid", component: "SplitGridNode", config: { parameters: {} } },
  { kind: "edit.image.gif", palette: "GIF Encoder", title: "GIF Encoder", component: "GifEncoderNode", config: { parameters: {} } },
  { kind: "edit.video.stitch", palette: "Video Stitch", title: "Video Stitch", component: "VideoStitchNode", config: { parameters: {} } },
  { kind: "edit.video.trim", palette: "Video Trim", title: "Video Trim", component: "VideoTrimNode", config: { parameters: {} } },
  { kind: "edit.video.frameGrab", palette: "Frame Grab", title: "Frame Grab", component: "VideoFrameGrabNode", config: { parameters: {} } },
  { kind: "edit.video.easeCurve", palette: "Ease Curve", title: "Ease Curve", component: "EaseCurveNode", config: { parameters: {} } },
  { kind: "output.single", palette: "Output", title: "Output", component: "OutputNode", config: { mediaType: null } },
  { kind: "output.gallery", palette: "Output Gallery", title: "Output Gallery", component: "OutputGalleryNode", config: { mediaType: null } },
  { kind: "inspect.imageCompare", palette: "Image Compare", title: "Image Compare", component: "ImageCompareNode", config: {} },
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

async function waitForCanvas(page, graphId) {
  // A cold Turbopack editor compile was measured at37s; list readiness does not
  // warm this route. Keep interaction assertions tight, allow initial compile.
  await page.goto(`${WORKFLOW_PATH}/${encodeURIComponent(graphId)}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  // Next.js dev tools mount a full-viewport shadow host even when no runtime
  // error exists. Keep the product surface pointer-testable in dev-server E2E;
  // console/page errors are captured independently by attachErrorCapture.
  await page.addStyleTag({ content: "nextjs-portal { pointer-events: none !important; }" });
  await expect(page.getByRole("application", { name: "Space canvas" })).toBeVisible();
  await expect(page.locator('[data-node-banana-component="WorkflowCanvas"]')).toBeVisible();
  await page.waitForTimeout(250);
}

async function expectPlayableVideo(video, assetId) {
  const page = video.page();
  const pane = page.locator(".react-flow__pane");
  await pane.click({ position: { x: 8, y: 8 } });
  const node = video.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' react-flow__node ')][1]");
  await expect(node).not.toHaveClass(/selected/);
  // Hover is the upstream playback gesture. Clicking a scaled preview can
  // hit its native pause control or the Trim Source/Trimmed toggle.
  await video.hover();
  if (assetId) {
    const expectedDigest = await mediaAssetDigest(video.page(), assetId);
    await expect.poll(() => video.evaluate(async (element) => {
      if (!element.currentSrc || element.readyState < 2) return {
        ready: element.readyState, network: element.networkState, paused: element.paused,
        time: element.currentTime, error: element.error?.message ?? null,
        width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height,
        connected: element.isConnected, hasSource: Boolean(element.currentSrc),
      };
      const source = element.currentSrc;
      const response = await fetch(source);
      const hash = await crypto.subtle.digest("SHA-256", await response.arrayBuffer());
      if (element.currentSrc !== source) return null;
      return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
    }), { timeout: 30_000, message: "Preview must decode the durable output, not its previous input" }).toBe(expectedDigest);
  }
  await expect.poll(() => video.evaluate((element) => ({
    ready: element.readyState >= 2,
    width: element.videoWidth,
    error: element.error?.message ?? null,
  })), { timeout: 15_000, message: "Video source must finish loading before playback" }).toMatchObject({ ready: true, error: null });
  const source = await video.evaluate((element) => element.currentSrc);
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
  await expect(video).toHaveJSProperty("paused", true);
  return probe;
}

async function createWorkflowViaApi(page, title = `${E2E_TITLE_PREFIX} ${Date.now()}`) {
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

async function waitForFreshWorkflow(page, graph) {
  await waitForCanvas(page, graph.id);
  const workflowName = page.locator('[data-node-banana-component="Header"]').getByText(graph.title, { exact: true });
  if (!(await workflowName.isVisible())) {
    // The editor opens the newest workflow, but another test/browser can create
    // a newer graph between our API POST and the route load. Select this graph
    // through the real hosted workflow browser instead of relying on list order.
    await page.getByRole("button", { name: "Open space" }).click();
    const menu = page.getByRole("dialog", { name: "Spaces", exact: true });
    await expect(menu.getByRole("button", { name: graph.title, exact: true })).toBeVisible({ timeout: 15_000 });
    await menu.getByRole("button", { name: graph.title, exact: true }).click();
  }
  await expect(workflowName).toBeVisible({ timeout: 15_000 });
}

async function readWorkflowViaApi(page, graphId) {
  const response = await page.request.get(`/api/generation-graphs/${encodeURIComponent(graphId)}`);
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

async function openAllNodes(page) {
  const button = page.getByRole("button", { name: "All nodes" });
  await expect(button).toBeVisible();
  await button.click();
  return page.getByRole("menu", { name: "All nodes" });
}

async function addNodeFromToolbar(page, label) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(350);
}

async function addNodeFromAllNodes(page, label) {
  const menu = await openAllNodes(page);
  const item = menu
    .getByRole("menuitem", { name: label, exact: true })
    .or(menu.getByRole("button", { name: label, exact: true }))
    .first();
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
  await page.waitForTimeout(350);
}

async function paletteHasNode(page, label) {
  const menu = await openAllNodes(page);
  const item = menu
    .getByRole("menuitem", { name: label, exact: true })
    .or(menu.getByRole("button", { name: label, exact: true }))
    .first();
  const present = await item.count() > 0 && await item.isVisible().catch(() => false);
  await page.getByRole("button", { name: "All nodes" }).click();
  await expect(menu).toBeHidden();
  return present;
}

const NODE_COMPONENT_NAMES = {
  "Image Input": "ImageInputNode",
  "Audio Input": "AudioInputNode",
  "Video Input": "VideoInputNode",
  Prompt: "PromptNode",
  "Prompt Constructor": "PromptConstructorNode",
  "Generate Image": "GenerateImageNode",
  "Generate Audio": "GenerateAudioNode",
  "Generate Video": "GenerateVideoNode",
  Annotation: "AnnotationNode",
  "Image Resize": "ImageResizeNode",
  "Remove Background": "RemoveBackgroundNode",
  "Split Grid": "SplitGridNode",
  "GIF Encoder": "GifEncoderNode",
  "Video Stitch": "VideoStitchNode",
  "Video Trim": "VideoTrimNode",
  "Frame Grab": "VideoFrameGrabNode",
  "Ease Curve": "EaseCurveNode",
  Output: "OutputNode",
  "Output Gallery": "OutputGalleryNode",
  "Image Compare": "ImageCompareNode",
};

function nodeBody(page, label) {
  const canvas = page.locator('[data-node-banana-component="WorkflowCanvas"]');
  const componentName = NODE_COMPONENT_NAMES[label];
  if (componentName) return canvas.locator(`[data-node-banana-component="${componentName}"]`).first();
  return canvas.getByRole("article", { name: label, exact: true }).first();
}

function nodeArticle(page, label) {
  return nodeBody(page, label);
}

function reactFlowNodeForArticle(page, label) {
  return nodeBody(page, label)
    .locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' react-flow__node ')][1]")
    .first();
}

async function connectHandles(page, sourceNode, targetNode, sourceType, targetType) {
  const sourceHandle = sourceNode.locator(`.react-flow__handle.source[data-handletype="${sourceType}"]`).first();
  const targetHandle = targetNode.locator(`.react-flow__handle.target[data-handletype="${targetType}"]`).first();
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
  const targetNode = targetHandle.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' react-flow__node ')][1]");
  const handleLabels = targetNode.locator("div.pointer-events-none.whitespace-nowrap");
  if (await handleLabels.count()) {
    await expect(handleLabels.first()).toHaveCSS("opacity", "1");
  }
  await page.mouse.up();
  expect(targetHit.handle, `target handle is covered at ${JSON.stringify(targetPoint)} by ${targetHit.className}`).toBeTruthy();
  await page.waitForTimeout(500);
}

async function connectImageHandles(page, sourceNode, targetNode) {
  return connectHandles(page, sourceNode, targetNode, "image", "image");
}

async function dragNodeByArticleBorder(page, node, distance) {
  const box = await node.boundingBox();
  if (!box) throw new Error("ReactFlow node has no box");
  const nodeId = await node.getAttribute("data-id");
  const header = nodeId
    ? page.locator(`[data-node-banana-component="FloatingNodeHeader"][data-node-id="${nodeId}"]`)
    : null;
  const headerBox = header && await header.count() > 0 ? await header.boundingBox() : null;
  // Stay inside the node's drag surface. Starting on the exact top edge can
  // hit React Flow's selected-node resize line instead of the node itself,
  // while header-heavy presenters (notably Output) put `nodrag` text at the
  // top-center point. Choose the first DOM-tested unblocked point, retaining
  // center-top as the preferred point for ordinary nodes.
  const candidates = [
    ...(headerBox ? [{ x: headerBox.x + headerBox.width / 2, y: headerBox.y + headerBox.height / 2 }] : []),
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
      insideHeader: Boolean(element?.closest?.('[data-node-banana-component="FloatingNodeHeader"]')),
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
  await page.getByRole("button", { name: "Fit View", exact: true }).click();
  await page.waitForTimeout(350);
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
  await expect.poll(async () => page.locator('[data-node-banana-component="WorkflowCanvas"] img').evaluateAll(
    (images) => images.filter((image) => image.getBoundingClientRect().width > 0)
      .every((image) => image.complete && image.naturalWidth > 0),
  ), { timeout: 30_000, message: "Canvas result images did not decode before screenshot" }).toBe(true);
  const directory = path.resolve("artifacts/node-banana-e2e/evidence");
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

async function waitForCompletedMediaOperation(page, graphId, nodeId, timeout = 60_000) {
  await expect.poll(
    async () => {
      const response = await page.request.get(
        `/api/generation-graphs/${encodeURIComponent(graphId)}/nodes/${encodeURIComponent(nodeId)}/executions`,
      );
      if (!response.ok()) return null;
      const payload = await response.json();
      return payload.executions?.find((execution) =>
        execution.executionKind === "media_operation" &&
        execution.status === "completed" &&
        Array.isArray(execution.outputAssetIds) &&
        execution.outputAssetIds.length > 0,
      ) ?? null;
    },
    { timeout, intervals: [250, 500, 1_000, 2_000], message: "annotation media operation did not complete" },
  ).toMatchObject({ executionKind: "media_operation", status: "completed" });
  const response = await page.request.get(
    `/api/generation-graphs/${encodeURIComponent(graphId)}/nodes/${encodeURIComponent(nodeId)}/executions`,
  );
  const payload = await response.json();
  return payload.executions.find((execution) =>
    execution.executionKind === "media_operation" &&
    execution.status === "completed" &&
    Array.isArray(execution.outputAssetIds) &&
    execution.outputAssetIds.length > 0,
  );
}

async function runBrowserMediaOperation(page, graphId, nodeId, button, timeout = 60_000) {
  const route = `/api/generation-graphs/${encodeURIComponent(graphId)}/nodes/${encodeURIComponent(nodeId)}/executions`;
  const startedResponsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && new URL(response.url()).pathname === route,
    { timeout },
  );
  // Native keyboard activation is part of the actual upstream button contract
  // and remains deterministic when an overview viewport places a control under
  // React Flow's minimap or a subpixel-scaled floating header.
  await button.focus();
  await button.press("Enter");
  const startedResponse = await startedResponsePromise;
  expect(startedResponse.ok(), `media operation start failed: ${startedResponse.status()} ${await startedResponse.text()}`).toBeTruthy();
  const started = await startedResponse.json();
  const completed = await waitForCompletedMediaOperation(page, graphId, nodeId, timeout);
  return {
    ...completed,
    plan: started.execution?.plan,
  };
}

async function waitForCompletedGeneration(page, graphId, nodeId, timeout = 60_000) {
  const route = `/api/generation-graphs/${encodeURIComponent(graphId)}/nodes/${encodeURIComponent(nodeId)}/executions`;
  let latest = null;
  await expect.poll(
    async () => {
      const response = await page.request.get(route);
      if (!response.ok()) return null;
      const payload = await response.json();
      latest = payload.executions?.[0] ?? null;
      return payload.executions?.find((execution) =>
        execution.executionKind === "generation" &&
        execution.status === "completed" &&
        Array.isArray(execution.outputAssetIds) &&
        execution.outputAssetIds.length > 0,
      ) ?? null;
    },
    { timeout, intervals: [250, 500, 1_000, 2_000], message: "hosted generation did not complete" },
  ).toMatchObject({ executionKind: "generation", status: "completed" });
  const response = await page.request.get(route);
  if (!response.ok()) throw new Error(`read generation executions failed: ${response.status()} ${await response.text()}`);
  const payload = await response.json();
  const completed = payload.executions?.find((execution) =>
    execution.executionKind === "generation" &&
    execution.status === "completed" &&
    Array.isArray(execution.outputAssetIds) &&
    execution.outputAssetIds.length > 0,
  );
  if (!completed) throw new Error(`generation completion disappeared; latest=${JSON.stringify(latest)}`);
  return completed;
}

async function runHostedGeneration(page, graphId, nodeId, header, timeout = 60_000) {
  const route = `/api/generation-graphs/${encodeURIComponent(graphId)}/nodes/${encodeURIComponent(nodeId)}/executions`;
  const startedResponsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && new URL(response.url()).pathname === route,
    { timeout },
  );
  const runButton = header.getByRole("button", { name: "Run this node" });
  await expect(runButton).toBeEnabled();
  await runButton.focus();
  await runButton.press("Enter");
  const startedResponse = await startedResponsePromise;
  expect(startedResponse.ok(), `generation start failed: ${startedResponse.status()} ${await startedResponse.text()}`).toBeTruthy();
  const started = await startedResponse.json();
  const completed = await waitForCompletedGeneration(page, graphId, nodeId, timeout);
  return { ...completed, plan: started.execution?.plan };
}

test.describe("Node Banana T25 real Chromium evidence", () => {
  test("original Prompt editor submits, cancels, and isolates Canvas shortcuts", async ({ page }, testInfo) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await replaceWorkflowViaApi(page, graph.id, [
        { id: "prompt-editor", kind: "input.prompt", configVersion: 1, position: { x: 0, y: 0 }, config: { text: "Original prompt" }, selectedOutputAssetId: null },
      ]);
      await waitForFreshWorkflow(page, graph);
      const body = nodeBody(page, "Prompt");
      await body.click({ position: { x: 18, y: 18 } });
      const expand = page.locator('[data-node-banana-component="FloatingNodeHeader"][data-node-id="prompt-editor"]').getByTitle("Expand editor");
      await expand.click();
      const editor = page.getByRole("dialog", { name: "Edit Prompt", exact: true });
      const text = editor.getByRole("textbox", { name: "Prompt text", exact: true });
      await expect(text).toBeFocused();
      await expect(text).toHaveValue("Original prompt");
      await text.fill("Edited prompt");
      await page.keyboard.press("Shift+i");
      const submitted = await text.inputValue();
      await editor.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(editor).toBeHidden();
      const saved = await waitForWorkflowState(page, graph.id, (value) => value.nodes[0]?.config.text === submitted, "Prompt editor submit not saved");
      expect(saved.nodes).toHaveLength(1);
      await expect(expand).toBeFocused();
      await expand.click();
      await text.fill("Discard this draft");
      await page.keyboard.press("Escape");
      const confirmation = page.getByRole("dialog", { name: "Unsaved prompt changes", exact: true });
      await expect(confirmation).toBeVisible();
      await captureEvidenceScreenshot(page, testInfo, "t30-prompt-confirmation");
      await confirmation.getByRole("button", { name: "Discard", exact: true }).click();
      await expect(editor).toBeHidden();
      expect((await readWorkflowViaApi(page, graph.id)).nodes[0].config.text).toBe(submitted);
      await page.reload(); await waitForFreshWorkflow(page, graph);
      await expect(nodeBody(page, "Prompt").locator("textarea")).toHaveValue(submitted);
      expect(errors).toEqual([]);
    } finally { await deleteWorkflowViaApi(page, graph.id); }
  });

  test("Prompt Constructor expands, resolves variables once, saves and reloads", async ({ page }, testInfo) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      const node = (id, kind, config, x) => ({ id, kind, config, configVersion: 1, position: { x, y: 0 }, selectedOutputAssetId: null });
      await replaceWorkflowViaApi(page, graph.id, [
        node("named", "input.prompt", { variableName: "cat", text: "@cat_long" }, 0),
        node("inline", "input.prompt", { text: '<var="cat_long">fox</var>' }, 400),
        node("constructor", "process.promptConstructor", { template: "@cat / @cat_long / @missing" }, 800),
      ], ["named", "inline"].map((id, sortOrder) => ({ id: `edge-${id}`, sourceNodeId: id, sourcePortId: "text", targetNodeId: "constructor", targetPortId: "text", sortOrder, hasPause: false })));
      await waitForFreshWorkflow(page, graph);
      const body = nodeBody(page, "Prompt Constructor");
      await expect(page.locator('.react-flow__node[data-id="constructor"]')).toHaveCSS("width", "340px");
      await body.locator("textarea").click();
      const expand = page.locator('[data-node-banana-component="FloatingNodeHeader"][data-node-id="constructor"]').getByTitle("Expand editor");
      await expand.click();
      const editor = page.getByRole("dialog", { name: "Edit Prompt Constructor", exact: true });
      await expect(editor.getByRole("textbox")).toBeFocused();
      await expect(editor.getByText("@cat_long / fox / @missing", { exact: true })).toBeVisible();
      await editor.getByRole("textbox").fill("Portrait: @cat_long");
      await editor.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(editor).toBeHidden();
      const saved = await waitForWorkflowState(page, graph.id, (value) => value.nodes.find((node) => node.id === "constructor")?.config.template === "Portrait: @cat_long", "Constructor template not saved");
      expect(saved.nodes.find((node) => node.id === "constructor").config).not.toHaveProperty("outputText");
      await page.reload(); await waitForFreshWorkflow(page, graph);
      await body.locator("textarea").click(); await expand.click();
      await expect(editor.getByText("Portrait: fox", { exact: true })).toBeVisible();
      await captureEvidenceScreenshot(page, testInfo, "t33-prompt-constructor");
      expect(errors).toEqual([]);
    } finally { await deleteWorkflowViaApi(page, graph.id); }
  });

  test("Quickstart explores all six presets and tutorial in new Spaces without sample assets", async ({ page }, testInfo) => {
    const errors = attachErrorCapture(page), requestedSamples = [];
    page.on("request", (request) => { if (/sample-images|template-thumbnails|community-workflows|api\/quickstart/.test(request.url())) requestedSamples.push(request.url()); });
    const original = await createWorkflowViaApi(page), created = [];
    const before = await readWorkflowViaApi(page, original.id);
    const presets = ["Product Shot", "Model + Product", "Color Variations", "Background Swap", "Style Transfer", "Scene Composite"];
    try {
      for (const [index, preset] of presets.entries()) {
        await waitForFreshWorkflow(page, original);
        await page.getByRole("button", { name: "Quickstart", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Quickstart", exact: true });
        await dialog.getByRole("button", { name: "Templates Pre-built workflows" }).click();
        await dialog.getByLabel("Starting content").selectOption(index % 2 ? "empty" : "minimal");
        if (index === 0) await captureEvidenceScreenshot(page, testInfo, "t33-quickstart-presets");
        await dialog.locator(".group").filter({ has: page.getByRole("heading", { name: preset, exact: true }) }).getByRole("button", { name: "Use workflow", exact: true }).click();
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
      await page.locator('[data-node-banana-component="FloatingActionBar"]').getByRole("button", { name: "Image", exact: true }).click();
      await expect(page.getByRole("button", { name: "Click to continue tutorial", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Click to continue tutorial", exact: true }).click({ position: { x: 10, y: 100 } });
      await expect(page.getByText("Inputs always go in on the left side of the node.", { exact: true })).toBeVisible();
      await captureEvidenceScreenshot(page, testInfo, "t33-tutorial");
      await page.getByRole("button", { name: "Skip tutorial", exact: true }).click();
      await expect(page).not.toHaveURL(/tutorial=1/);
      await expect(page.getByRole("button", { name: "Skip tutorial", exact: true })).toBeHidden();
      expect((await readWorkflowViaApi(page, original.id))).toEqual(before);
      expect(requestedSamples).toEqual([]); expect(errors).toEqual([]);
    } finally { for (const id of [...created, original.id]) await deleteWorkflowViaApi(page, id); }
  });

  test("Split cell template edits apply atomically, undo, reload and protect replacement", async ({ page }, testInfo) => {
    const errors = attachErrorCapture(page), executions = [];
    page.on("request", (request) => { if (request.method() === "POST" && /\/executions$/.test(request.url())) executions.push(request.url()); });
    const graph = await createWorkflowViaApi(page);
    try {
      await replaceWorkflowViaApi(page, graph.id, [{ id: "split", kind: "edit.image.splitGrid", configVersion: 1, config: { parameters: { rows: 1, cols: 2 } }, position: { x: 0, y: 0 }, selectedOutputAssetId: null }], []);
      await waitForFreshWorkflow(page, graph);
      await nodeBody(page, "Split Grid").getByRole("button", { name: /Cell nodes/ }).click();
      const modal = page.getByRole("dialog", { name: "Cell template", exact: true });
      await expect(modal).toBeVisible();
      await modal.getByRole("button", { name: "Prompt + Generate", exact: true }).click();
      await modal.locator(".react-flow__controls-fitview").click();
      await modal.locator("textarea").click();
      await modal.locator("textarea").fill("A hand-painted landscape");
      await modal.getByRole("button", { name: "Browse", exact: true }).click();
      const models = page.getByRole("dialog", { name: "Browse Models" });
      await models.getByRole("button").filter({ has: page.getByText("mrfakename-z-image-turbo-v2", { exact: true }) }).click();
      await expect(models).toBeHidden();
      const cellOutput = modal.locator('.react-flow__node[data-id="cell-image"] .react-flow__handle-right');
      const handle = await cellOutput.boundingBox(), bounds = await modal.boundingBox();
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height - 150, { steps: 12 });
      await page.mouse.up();
      await page.getByRole("button", { name: "Resize Image", exact: true }).click();
      await modal.locator(".react-flow__controls-fitview").click();
      await captureEvidenceScreenshot(page, testInfo, "t34-cell-template");
      await modal.getByRole("button", { name: "Apply to 2 cells", exact: true }).click();
      await expect(modal).toBeHidden();
      const saved = await waitForWorkflowState(page, graph.id, (value) => value.nodes.length === 9 && value.groups.length === 2, "template topology was not saved");
      expect(saved.edges).toHaveLength(8);
      expect(saved.nodes.filter((node) => node.kind === "edit.image.resize")).toHaveLength(2);
      expect(saved.nodes.filter((node) => node.kind === "generate.image").every((node) => node.config.modelKey === "mrfakename-z-image-turbo-v2")).toBe(true);
      expect(saved.nodes.filter((node) => node.kind === "input.prompt").every((node) => node.config.text === "A hand-painted landscape")).toBe(true);
      await page.keyboard.press("Control+z");
      await waitForWorkflowState(page, graph.id, (value) => value.nodes.length === 1 && value.groups.length === 0, "Apply did not undo once");
      await page.keyboard.press("Control+Shift+z");
      await waitForWorkflowState(page, graph.id, (value) => value.nodes.length === 9, "Apply did not redo");
      await page.reload(); await expect(page.locator(".react-flow__pane")).toBeVisible();
      await nodeBody(page, "Split Grid").getByRole("button", { name: /Cell nodes/ }).click();
      await expect(modal.locator("textarea")).toHaveValue("A hand-painted landscape");
      await modal.getByRole("button", { name: "Apply to 2 cells", exact: true }).click();
      await expect(page.getByRole("alertdialog", { name: "Replace existing cells?" })).toBeVisible();
      await page.getByRole("button", { name: "Keep existing cells", exact: true }).click();
      expect((await readWorkflowViaApi(page, graph.id)).nodes.map((node) => node.id)).toEqual(saved.nodes.map((node) => node.id));
      await modal.getByRole("button", { name: "Apply to 2 cells", exact: true }).click();
      await page.getByRole("button", { name: "Replace cells", exact: true }).click();
      await expect(modal).toBeHidden();
      await waitForWorkflowState(page, graph.id, (value) => value.nodes.length === 9 && value.nodes.some((node) => node.id !== "split" && !saved.nodes.some((old) => old.id === node.id)), "replacement did not commit");
      expect(executions).toEqual([]); expect(errors).toEqual([]);
    } finally { await deleteWorkflowViaApi(page, graph.id); }
  });

  test("adaptive preview changes with zoom but Input download keeps original bytes", async ({ page }, testInfo) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    const original = deterministicPng(512, 384, 1);
    try {
      await replaceWorkflowViaApi(page, graph.id, [{ id: "adaptive-image", kind: "input.image", configVersion: 1, position: { x: 0, y: 0 }, config: { assetId: null }, selectedOutputAssetId: null }]);
      await waitForFreshWorkflow(page, graph);
      const body = nodeBody(page, "Image Input");
      await body.locator('input[type="file"]').setInputFiles({ name: "leesfield-adaptive-source.png", mimeType: "image/png", buffer: original });
      const saved = await waitForWorkflowState(page, graph.id, (value) => Boolean(value.nodes[0].config.assetId), "adaptive input upload not durable");
      const preview = body.locator("img").first();
      await expect.poll(() => preview.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
      // Use actual zoom controls across the200px effective-width boundary.
      for (let index = 0; index < 4; index += 1) await page.getByRole("button", { name: "Zoom In", exact: true }).click();
      await expect.poll(() => preview.getAttribute("src")).toContain(`/api/media-assets/${saved.nodes[0].config.assetId}/content`);
      for (let index = 0; index < 10; index += 1) {
        if ((await preview.getAttribute("src"))?.startsWith("data:image/jpeg")) break;
        const out = page.getByRole("button", { name: "Zoom Out", exact: true });
        if (await out.isDisabled()) break;
        await out.click();
      }
      await expect.poll(() => preview.getAttribute("src")).toMatch(/^data:image\/jpeg/);
      await captureEvidenceScreenshot(page, testInfo, "t30-adaptive-thumbnail");
      await body.hover();
      const downloading = page.waitForEvent("download");
      await body.getByRole("button", { name: "Download image", exact: true }).click();
      const download = await downloading;
      const bytes = await readFile(await download.path());
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(createHash("sha256").update(original).digest("hex"));
      expect(await mediaAssetDigest(page, saved.nodes[0].config.assetId)).toBe(createHash("sha256").update(original).digest("hex"));
      await page.reload(); await waitForFreshWorkflow(page, graph);
      await expect.poll(() => preview.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
      expect((await readWorkflowViaApi(page, graph.id)).nodes[0].config.assetId).toBe(saved.nodes[0].config.assetId);
      expect(errors).toEqual([]);
    } finally { await deleteWorkflowViaApi(page, graph.id); }
  });

  test("owner model defaults use original picker and persist only into new Space nodes", async ({ page }, testInfo) => {
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
        await picker.getByRole("textbox", { name: "Search models" }).fill(model.key);
        const card = picker.locator("button").filter({ has: page.getByText(model.label, { exact: true }) }).first();
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
      await page.reload(); await waitForFreshWorkflow(page, graph);
      const canvas = page.locator('[data-node-banana-component="WorkflowCanvas"]');
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

  test("Space comments navigate original headers and original Settings preserves Canvas changes", async ({ page }, testInfo) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    const originalInline = (await (await page.request.get("/api/spaces/preferences")).json()).preferences.inlineParametersEnabled ?? false;
    try {
      await replaceWorkflowViaApi(page, graph.id, [
        { id: "comment-a", kind: "input.prompt", configVersion: 1, position: { x: 0, y: 0 }, config: { text: "first", presentation: { comment: "First review comment" } }, selectedOutputAssetId: null },
        { id: "comment-b", kind: "input.prompt", configVersion: 1, position: { x: 700, y: 100 }, config: { text: "second", presentation: { comment: "Second review comment" } }, selectedOutputAssetId: null },
      ]);
      await waitForFreshWorkflow(page, graph);
      const navigate = page.getByRole("button", { name: "Navigate comments" });
      for (const name of ["Back to Spaces", "Save space", "Open space", "Space settings", "Keyboard shortcuts"]) {
        const bounds = await page.getByRole("button", { name, exact: true }).boundingBox();
        expect(bounds, name).not.toBeNull();
        expect(bounds.x, name).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width, name).toBeLessThanOrEqual(page.viewportSize().width);
      }
      await expect(navigate).toHaveAttribute("title", "2 unviewed comments (2 total)");
      const before = await readWorkflowViaApi(page, graph.id);
      await navigate.click();
      await expect(page.getByText("First review comment", { exact: true })).toBeVisible();
      await expect(page.getByText("1/2", { exact: true })).toBeVisible();
      await page.getByTitle("Next comment", { exact: true }).click();
      await expect(page.getByText("Second review comment", { exact: true })).toBeVisible();
      await expect(navigate).toHaveAttribute("title", "0 unviewed comments (2 total)");
      await page.getByTitle("Next comment", { exact: true }).click();
      await expect(page.getByText("First review comment", { exact: true })).toBeVisible();
      expect((await readWorkflowViaApi(page, graph.id)).version).toBe(before.version);
      await page.getByRole("button", { name: "Space settings", exact: true }).click();
      const settings = page.getByRole("dialog", { name: "Space Settings" });
      await expect(settings).toBeVisible();
      await settings.getByRole("tab", { name: "Canvas", exact: true }).click();
      await settings.getByRole("button", { name: "Middle Mouse", exact: true }).click();
      await settings.getByRole("tab", { name: "Space", exact: true }).click();
      const inline = settings.getByRole("switch", { name: "Show model settings on nodes" });
      await inline.click();
      await captureEvidenceScreenshot(page, testInfo, "t30-original-settings");
      await settings.getByRole("button", { name: "Save", exact: true }).click();
      await expect(settings).not.toBeVisible();
      await page.getByRole("button", { name: "Space settings", exact: true }).click();
      await settings.getByRole("tab", { name: "Canvas", exact: true }).click();
      await expect(settings.getByRole("button", { name: "Middle Mouse", exact: true })).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press("Escape");
      await page.reload();
      await waitForFreshWorkflow(page, graph);
      await expect(navigate).toHaveAttribute("title", "2 unviewed comments (2 total)");
      await page.getByRole("button", { name: "Space settings", exact: true }).click();
      await expect(settings.getByRole("switch", { name: "Show model settings on nodes" })).toHaveAttribute("aria-checked", String(!originalInline));
      await settings.getByRole("tab", { name: "Canvas", exact: true }).click();
      await expect(settings.getByRole("button", { name: "Middle Mouse", exact: true })).toHaveAttribute("aria-pressed", "true");
      await settings.getByRole("button", { name: "Space + Drag", exact: true }).click();
      await settings.getByRole("button", { name: "Save", exact: true }).click();
      expect(errors).toEqual([]);
    } finally {
      const current = (await (await page.request.get("/api/spaces/preferences")).json()).preferences;
      expect((await page.request.patch("/api/spaces/preferences", { data: { action: "inline", expectedRevision: current.revision, enabled: originalInline } })).ok()).toBeTruthy();
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
    if (/generation media|generation Nodes|real generation Run/.test(testInfo.title)) {
      const current = (await (await page.request.get("/api/spaces/preferences")).json()).preferences;
      originalInlineFixture = current.inlineParametersEnabled ?? false;
      expect((await page.request.patch("/api/spaces/preferences", { data: { action: "inline", expectedRevision: current.revision, enabled: true } })).ok()).toBeTruthy();
    }
    page.setDefaultTimeout(8_000);
    // setDefaultTimeout also affects navigation unless explicitly overridden.
    page.setDefaultNavigationTimeout(30_000);
  });

  test("canvas clipboard, toolbar drop and media batches persist without stealing form shortcuts", async ({ page, context }) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await waitForFreshWorkflow(page, graph);
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      const canvas = page.locator('[data-node-banana-component="WorkflowCanvas"]');
      await page.evaluate(() => navigator.clipboard.writeText("Durable clipboard prompt"));
      await canvas.focus(); await page.keyboard.press("Control+v");
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
      await page.getByRole("button", { name: "Close keyboard shortcuts" }).click();
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
      await canvas.focus(); await page.keyboard.press("Control+v");
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
      // Real DOM DataTransfer/File decoding and real upload/confirm; no OS drag automation.
      await canvas.evaluate((element, { files, dropPoint }) => {
        const transfer = new DataTransfer();
        for (const file of files) transfer.items.add(new File([new Uint8Array(file.bytes)], file.name, { type: file.type }));
        element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, clientX: dropPoint.x, clientY: dropPoint.y, dataTransfer: transfer }));
      }, { files, dropPoint });
      await waitForWorkflowState(page, graph.id, (value) => value.nodes.length === 5, "three media file batch not persisted", 60_000);
      const dropped = await readWorkflowViaApi(page, graph.id);
      const batch = dropped.nodes.filter((node) => !afterImage.nodes.some((old) => old.id === node.id));
      expect(batch.map((node) => node.kind)).toEqual(["input.image", "input.audio", "input.video"]);
      expect(batch.every((node) => Boolean(node.config.assetId))).toBe(true);
      expect(batch[1].position.x - batch[0].position.x).toBe(240);
      expect(batch[2].position.x - batch[1].position.x).toBe(240);
      await canvas.focus(); await page.keyboard.press("h");
      await waitForWorkflowState(page, graph.id, (value) => {
        const nodes = batch.map((item) => value.nodes.find((node) => node.id === item.id));
        return nodes[1].position.x - nodes[0].position.x !== 240 && nodes.every((node) => node.position.y === nodes[0].position.y);
      }, "horizontal shortcut did not arrange selection");
      await page.keyboard.press("Control+z");
      await waitForWorkflowState(page, graph.id, (value) => value.nodes.find((node) => node.id === batch[1].id).position.x === batch[1].position.x, "layout did not undo once");
      const imageButton = page.locator('[data-node-banana-component="FloatingActionBar"]').getByRole("button", { name: "Image", exact: true });
      await imageButton.dragTo(canvas, { targetPosition: { x: 25, y: 65 } });
      await waitForWorkflowState(page, graph.id, (value) => value.nodes.length === 6, "toolbar node drag not persisted");
      const saved = await readWorkflowViaApi(page, graph.id);
      await page.reload({ waitUntil: "domcontentloaded" }); await waitForCanvas(page, graph.id);
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
          await expect(body.locator("canvas")).toBeAttached({ timeout: 30_000 });
        }
      }
      await fitCanvas(page);
      await captureEvidenceScreenshot(page, test.info(), "t29-canvas-input");
      expect(errors).toEqual([]);
    } finally { await deleteWorkflowViaApi(page, graph.id); }
  });

  test("general groups persist upstream controls, gestures, clipboard and undo", async ({ page }) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await replaceWorkflowViaApi(page, graph.id, [0, 1].map((index) => ({
        id: `group_input_${index}`, kind: "input.image", configVersion: 1,
        position: { x: index * 420, y: 100 }, config: { assetId: null }, selectedOutputAssetId: null,
      })));
      await waitForFreshWorkflow(page, graph);
      await fitCanvas(page);
      const canvas = page.locator('[data-node-banana-component="WorkflowCanvas"]');
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
      await page.getByRole("button", { name: "Create group", exact: true }).click();
      await waitForWorkflowState(page, graph.id, (value) => value.groups.length === 1, "group was not saved");
      let saved = await readWorkflowViaApi(page, graph.id);
      expect(saved.groups[0].memberNodeIds).toEqual(saved.nodes.map((node) => node.id));
      expect(saved.schemaVersion).toBe(3);
      await page.getByText("Group 1", { exact: true }).dblclick();
      // The original group editor focuses/selects its inline input on double click.
      await expect(page.locator('input:focus')).toHaveValue("Group 1");
      await page.locator('input:focus').fill("Retained group");
      await page.keyboard.press("Enter");
      await waitForWorkflowState(page, graph.id, (value) => value.groups[0]?.title === "Retained group", "rename was not saved");
      await page.getByRole("button", { name: "Group options", exact: true }).click();
      await page.getByRole("button", { name: "Background", exact: true }).click();
      await page.getByRole("button", { name: "Blue", exact: true }).click();
      await expect(canvas.locator(':scope > .react-flow')).toHaveCSS("z-index", "101");
      await page.getByRole("button", { name: "Lock", exact: true }).click();
      await waitForWorkflowState(page, graph.id, (value) => value.groups[0]?.locked && value.groups[0]?.color === "blue", "properties were not saved");
      saved = await readWorkflowViaApi(page, graph.id);
      const header = await page.getByText("Retained group", { exact: true }).boundingBox();
      await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2);
      await page.mouse.down(); await page.mouse.move(header.x + header.width / 2 + 24, header.y + header.height / 2 + 24, { steps: 12 }); await page.mouse.up();
      await waitForWorkflowState(page, graph.id, (value) => value.groups[0]?.bounds.x !== saved.groups[0].bounds.x, "locked group did not move");
      const moved = await readWorkflowViaApi(page, graph.id);
      const delta = moved.groups[0].bounds.x - saved.groups[0].bounds.x;
      for (const node of moved.nodes) expect(node.position.x - saved.nodes.find((old) => old.id === node.id).position.x).toBeCloseTo(delta, 5);
      await canvas.focus(); await page.keyboard.press("Control+z");
      await waitForWorkflowState(page, graph.id, (value) => value.groups[0]?.bounds.x === saved.groups[0].bounds.x, "group gesture did not undo in one step");
      await page.keyboard.press("Control+Shift+z");
      await waitForWorkflowState(page, graph.id, (value) => value.groups[0]?.bounds.x === moved.groups[0].bounds.x, "group gesture did not redo");
      await fitCanvas(page);
      const resize = await page.locator('.group-resize-controls .cursor-se-resize').boundingBox();
      expect(await page.evaluate(({ x, y, width, height }) =>
        document.elementFromPoint(x + width / 2, y + height / 2)?.classList.contains("cursor-se-resize"), resize)).toBe(true);
      await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2);
      await page.mouse.down(); await page.mouse.move(resize.x - 12, resize.y - 12, { steps: 12 }); await page.mouse.up();
      await waitForWorkflowState(page, graph.id, (value) => value.groups[0]?.bounds.width < moved.groups[0].bounds.width, "group resize was not saved");
      expect((await readWorkflowViaApi(page, graph.id)).nodes).toEqual(moved.nodes);
      await canvas.focus(); await page.keyboard.press("Control+z");
      await waitForWorkflowState(page, graph.id, (value) => value.groups[0]?.bounds.width === moved.groups[0].bounds.width, "resize did not undo in one step");
      await page.keyboard.press("Control+c"); await page.keyboard.press("Control+v");
      await waitForWorkflowState(page, graph.id, (value) => value.nodes.length === 4 && value.groups.length === 2, "group clipboard was not saved");
      const pasted = await readWorkflowViaApi(page, graph.id);
      const freshGroup = pasted.groups.find((group) => group.id !== moved.groups[0].id);
      expect(freshGroup.memberNodeIds.every((id) => !moved.nodes.some((node) => node.id === id))).toBe(true);
      expect(freshGroup.bounds.x).toBeCloseTo(moved.groups[0].bounds.x + 50, 5);
      await page.getByRole("button", { name: "Remove from group", exact: true }).click();
      await waitForWorkflowState(page, graph.id, (value) => value.groups.some((group) => group.id === freshGroup.id && group.memberNodeIds.length === 0), "ungroup must preserve empty frame");
      await canvas.focus(); await page.keyboard.press("Control+z");
      await waitForWorkflowState(page, graph.id, (value) => value.groups.find((group) => group.id === freshGroup.id)?.memberNodeIds.length === 2, "ungroup did not undo");
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByText("Retained group", { exact: true })).toHaveCount(2);
      const restored = await readWorkflowViaApi(page, graph.id);
      expect(restored.groups).toEqual(pasted.groups);
      await page.getByRole("button", { name: "Group options", exact: true }).first().click();
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await waitForWorkflowState(page, graph.id, (value) => value.groups.length === 1, "group delete was not saved");
      expect((await readWorkflowViaApi(page, graph.id)).nodes).toEqual(restored.nodes);
      await captureEvidenceScreenshot(page, test.info(), "t28-general-groups");
      expect(errors).toEqual([]);
    } finally { await deleteWorkflowViaApi(page, graph.id); }
  });

  test("selected image ZIP downloads original durable bytes through the upstream toolbar", async ({ page }) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await replaceWorkflowViaApi(page, graph.id, [0, 1].map((index) => ({
        id: `zip_input_${index}`, kind: "input.image", configVersion: 1,
        position: { x: index * 420, y: 100 }, config: { assetId: null }, selectedOutputAssetId: null,
      })));
      await waitForFreshWorkflow(page, graph);
      for (const index of [0, 1]) {
        const input = page.locator(`.react-flow__node[data-id="zip_input_${index}"]`);
        await input.locator('input[type="file"]').setInputFiles({
          name: `스크린샷 node-banana ${index}.png`, mimeType: "image/png",
          buffer: deterministicPng(32, 24, index),
        });
        await waitForWorkflowState(page, graph.id, (value) =>
          Boolean(value.nodes.find((node) => node.id === `zip_input_${index}`)?.config.assetId), "ZIP input was not saved");
      }
      const saved = await readWorkflowViaApi(page, graph.id);
      const digests = await Promise.all(saved.nodes.map((node) => mediaAssetDigest(page, node.config.assetId)));
      await fitCanvas(page);
      const inputs = page.locator('.react-flow__node');
      const canvasBox = await page.locator('[data-node-banana-component="WorkflowCanvas"]').boundingBox();
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
      const button = page.getByRole("button", { name: "Download images as ZIP" });
      await expect(button).toBeEnabled();
      const pending = page.waitForEvent("download");
      await button.click();
      const download = await pending;
      expect(download.suggestedFilename()).toMatch(/^leesfield-images-\d+\.zip$/);
      const zipPath = test.info().outputPath("selected-images.zip");
      await download.saveAs(zipPath);
      const bytes = await readFile(zipPath);
      expect(bytes.readUInt32LE(bytes.length - 22)).toBe(0x06054b50);
      expect(bytes.readUInt16LE(bytes.length - 12)).toBe(2);
      let offset = 0;
      for (const index of [0, 1]) {
        expect(bytes.readUInt32LE(offset)).toBe(0x04034b50);
        expect(bytes.readUInt16LE(offset + 8)).toBe(0);
        const size = bytes.readUInt32LE(offset + 18);
        const nameSize = bytes.readUInt16LE(offset + 26);
        const extraSize = bytes.readUInt16LE(offset + 28);
        expect(bytes.subarray(offset + 30, offset + 30 + nameSize).toString()).toBe(`leesfield-image-00${index + 1}.png`);
        const start = offset + 30 + nameSize + extraSize;
        expect(createHash("sha256").update(bytes.subarray(start, start + size)).digest("hex")).toBe(digests[index]);
        offset = start + size;
      }
      await expect(button).toBeEnabled();
      expect((await readWorkflowViaApi(page, graph.id)).nodes).toEqual(saved.nodes);
      await captureEvidenceScreenshot(page, test.info(), "t28-selected-image-zip");
      expect(errors).toEqual([]);
    } finally {
      await deleteWorkflowViaApi(page, graph.id);
    }
  });

  test("icon handles replace ports and support click keyboard and drag", async ({ page }, testInfo) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    const ids = [`source-${graph.id}`, `target-${graph.id}`];
    try {
      await replaceWorkflowViaApi(page, graph.id, ids.map((id, index) => ({ id, kind: "edit.image.resize", configVersion: 1, config: { parameters: {} }, position: { x: index * 500, y: 100 + index * 80 }, selectedOutputAssetId: null })));
      await waitForFreshWorkflow(page, graph);
      await fitCanvas(page);
      const source = page.locator(`.react-flow__node[data-id="${ids[0]}"]`);
      const target = page.locator(`.react-flow__node[data-id="${ids[1]}"]`);
      const icon = source.getByRole('button', { name: 'Connect image output', exact: true });
      await expect(page.locator('.react-flow__handle:not(.node-banana-port-action)')).toHaveCount(0);
      await expect(page.locator('button.node-banana-port-action')).toHaveCount(0);
      await expect(icon.locator('svg')).toHaveCount(1);
      await source.click({ position: { x: 80, y: 20 } });
      await source.hover();
      await expect(source.getByText('Image In', { exact: true })).toHaveCount(0);
      await expect(source.getByText('Image Out', { exact: true })).toHaveCount(0);
      await icon.click();
      const menu = page.locator('[data-node-banana-component="ConnectionDropMenu"]');
      await expect(menu).toBeVisible();
      await page.keyboard.press('Escape');
      await icon.focus();
      await page.keyboard.press('Enter');
      await expect(menu).toBeVisible();
      await page.keyboard.press('Escape');
      await connectHandles(page, source, target, 'image', 'image');
      await waitForWorkflowState(page, graph.id, snapshot => snapshot.edges.length === 1, 'icon drag did not connect');
      await expect(page.locator('.react-flow__edge-path').first()).toBeVisible();
      await expect(menu).toBeHidden();
      await target.hover();
      await captureEvidenceScreenshot(page, testInfo, 't37-icon-handles');
      await page.reload();
      await waitForFreshWorkflow(page, graph);
      expect((await readWorkflowViaApi(page, graph.id)).edges).toHaveLength(1);
      await page.mouse.move(10, 100);
      await expect(icon).toHaveCSS('opacity', '1');
      await expect(target.getByRole('button', { name: 'Connect image input', exact: true })).toHaveCSS('opacity', '1');
      await expect(source.getByRole('button', { name: 'Connect image input', exact: true })).toHaveCSS('opacity', '0');
      const snapshot = await readWorkflowViaApi(page, graph.id);
      const inputId = `input-${graph.id}`;
      await replaceWorkflowViaApi(page, graph.id, [...snapshot.nodes, { id: inputId, kind: 'input.image', configVersion: 1, config: { assetId: null }, position: { x: 1000, y: 100 }, selectedOutputAssetId: null }], snapshot.edges);
      await page.reload();
      await waitForFreshWorkflow(page, graph);
      await fitCanvas(page);
      const inputNode = page.locator(`.react-flow__node[data-id="${inputId}"]`);
      await inputNode.hover();
      await expect(inputNode.locator('.react-flow__handle[data-handleid="reference"]')).toHaveCSS('background-color', 'rgb(38, 38, 38)');
      await expect(icon).toHaveCSS('background-color', 'rgb(38, 38, 38)');
      await captureEvidenceScreenshot(page, testInfo, 't40-reference-icon-color');
      expect(errors).toEqual([]);
    } finally { await deleteWorkflowViaApi(page, graph.id); }
  });

  test("port actions upload or select source assets and connect atomically", async ({ page }, testInfo) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    const resizeId = `resize-${graph.id}`;
    try {
      await replaceWorkflowViaApi(page, graph.id, [{ id: resizeId, kind: "edit.image.resize", configVersion: 1, config: { parameters: {} }, position: { x: 400, y: 100 }, selectedOutputAssetId: null }]);
      await waitForFreshWorkflow(page, graph);
      const resize = page.locator(`.react-flow__node[data-id="${resizeId}"]`);
      await resize.click({ position: { x: 80, y: 20 } });
      const port = resize.getByRole("button", { name: "Connect image input", exact: true });
      await expect(port).toHaveClass(/react-flow__handle/);
      await expect(resize.locator('.react-flow__handle:not(.node-banana-port-action)')).toHaveCount(0);
      await expect(resize.locator('button.node-banana-port-action')).toHaveCount(0);
      await expect(port.locator('svg')).toHaveCount(1);
      await port.click();
      const menu = page.locator('[data-node-banana-component="ConnectionDropMenu"]');
      await expect(menu.getByRole("button", { name: "Assets", exact: true })).toBeVisible();
      await captureEvidenceScreenshot(page, testInfo, "t36-port-menu");
      await menu.getByRole("button", { name: "Assets", exact: true }).click();
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
      await menu.getByRole("button", { name: "Upload", exact: true }).click();
      await (await chooser).setFiles({ name: "t36-input.png", mimeType: "image/png", buffer: deterministicPng(40, 32) });
      const uploaded = await waitForWorkflowState(page, graph.id, snapshot => snapshot.nodes.length === 2 && snapshot.edges.length === 1, "port upload did not connect");
      const input = uploaded.nodes.find(node => node.kind === "input.image");
      expect(input.config.assetId).toEqual(expect.any(String));
      await page.locator('[data-node-banana-component="WorkflowCanvas"]').focus();
      await page.keyboard.press("ControlOrMeta+z");
      await waitForWorkflowState(page, graph.id, snapshot => snapshot.nodes.length === 1 && snapshot.edges.length === 0, "node and edge were not one Undo");
      await port.click();
      await menu.getByRole("button", { name: "Assets", exact: true }).click();
      await assets.getByPlaceholder("Search loaded assets...").fill(input.config.assetId);
      await expect(assets.locator('button[aria-pressed]')).toHaveCount(1, { timeout: 45_000 });
      await expect(assets.locator('button[aria-pressed] img')).toBeVisible();
      await captureEvidenceScreenshot(page, testInfo, "t36-assets-ready");
      await assets.locator('button[aria-pressed]').click();
      await expect(assets).toBeHidden();
      const selected = await waitForWorkflowState(page, graph.id, snapshot => snapshot.nodes.length === 2 && snapshot.edges.length === 1, "asset selection did not connect");
      expect(selected.nodes.find(node => node.kind === "input.image").config.assetId).toBe(input.config.assetId);
      await fitCanvas(page);
      const inputNode = page.locator(`.react-flow__node[data-id="${selected.nodes.find(node => node.kind === 'input.image').id}"]`);
      const inputPort = inputNode.getByRole('button', { name: 'Connect image output', exact: true });
      await expect(inputNode.getByRole('button', { name: /^(Assets|Replace)$/ })).toHaveCount(0);
      await inputPort.click();
      await expect(menu.getByRole('button', { name: 'Upload', exact: true })).toBeVisible();
      await menu.getByRole('button', { name: 'Assets', exact: true }).click();
      await assets.getByRole('button', { name: 'Close assets' }).click();
      expect((await readWorkflowViaApi(page, graph.id)).nodes).toHaveLength(2);
      await inputPort.click();
      const replacementChooser = page.waitForEvent('filechooser');
      await menu.getByRole('button', { name: 'Upload', exact: true }).click();
      await (await replacementChooser).setFiles({ name: 't39-replace.png', mimeType: 'image/png', buffer: deterministicPng(48, 36) });
      const replaced = await waitForWorkflowState(page, graph.id, snapshot => snapshot.nodes.find(node => node.id === selected.nodes.find(node => node.kind === 'input.image').id)?.config.assetId !== input.config.assetId, 'input menu upload did not replace');
      expect(replaced.nodes).toHaveLength(2);
      expect(replaced.edges).toHaveLength(1);
      await inputPort.click();
      await menu.getByRole('button', { name: 'Assets', exact: true }).click();
      await assets.getByPlaceholder('Search loaded assets...').fill(input.config.assetId);
      await expect(assets.locator('button[aria-pressed]')).toHaveCount(1, { timeout: 45_000 });
      await assets.locator('button[aria-pressed]').click();
      await waitForWorkflowState(page, graph.id, snapshot => snapshot.nodes.length === 2 && snapshot.edges.length === 1 && snapshot.nodes.find(node => node.kind === 'input.image').config.assetId === input.config.assetId, 'input menu assets did not replace');
      await page.reload();
      await waitForFreshWorkflow(page, graph);
      expect((await readWorkflowViaApi(page, graph.id)).edges).toHaveLength(1);
      await expect(page.getByRole("button", { name: "History assets", exact: true })).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally { await deleteWorkflowViaApi(page, graph.id); }
  });

  test("Spaces list creates, copies, deletes and returns through the Leesfield brand header", async ({ page }) => {
    const errors = attachErrorCapture(page);
    const ids = [];
    let title = `Spaces lifecycle ${test.info().project.name} ${Date.now()}`;
    try {
      const before = (await (await page.request.get("/api/generation-graphs")).json()).graphs;
      await page.goto("/spaces", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Spaces", exact: true })).toBeVisible();
      await expect(page.locator('[data-app-brand-logo]')).toBeVisible();
      await expect(page.locator('[data-node-banana-component="WorkflowCanvas"]')).toHaveCount(0);
      const after = (await (await page.request.get("/api/generation-graphs")).json()).graphs;
      expect(after.map((graph) => graph.id).sort()).toEqual(before.map((graph) => graph.id).sort());
      await page.getByRole("button", { name: "New Space", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("textbox", { name: "Space name" }).fill(title);
      const created = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/generation-graphs");
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      const graph = (await (await created).json()).graph; ids.push(graph.id);
      // The first detail route compiles the vendored canvas in the dev server.
      await expect(page).toHaveURL(new RegExp(`/spaces/${graph.id}$`), { timeout: 30_000 });
      await expect(page.locator('[data-node-banana-component="WorkflowCanvas"]')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('[data-app-brand-logo]')).toContainText("leesfield");
      const header = page.locator('[data-node-banana-component="Header"]');
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
      await page.getByRole("dialog").getByRole("textbox", { name: "Space name" }).fill(title);
      await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect((await (await page.request.get(`/api/generation-graphs/${graph.id}`)).json()).graph.title).toBe(title);
      const copied = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/generation-graphs/${graph.id}/copy`);
      await page.getByRole("button", { name: `Copy ${title}`, exact: true }).click();
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

  test("the complete 20-node inventory uses the real palette where available, persists, and reloads", async ({ page }) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await waitForFreshWorkflow(page, graph);
      // Exercise all 20 entries through the real All nodes palette at both
      // supported viewports. The E2E server advertises its deterministic
      // background-removal processor through the same capability gate used by
      // production.
      expect(await paletteHasNode(page, "Audio Edit")).toBe(false);
      const paletteCases = [];
      for (const nodeCase of SUPPORTED_NODE_CASES) {
        if (nodeCase.capabilityGated && !(await paletteHasNode(page, nodeCase.palette))) continue;
        await addNodeFromAllNodes(page, nodeCase.palette);
        paletteCases.push(nodeCase);
      }
      await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => paletteCases.every((item) => snapshot.nodes.some((node) => node.kind === item.kind)),
        "the real All nodes palette did not persist every available node kind",
        45_000,
      );
      const paletteSnapshot = await readWorkflowViaApi(page, graph.id);
      expect(paletteSnapshot.nodes.map((node) => node.kind).sort()).toEqual(paletteCases.map((item) => item.kind).sort());

      expect(paletteCases.map((item) => item.kind).sort()).toEqual(
        SUPPORTED_NODE_CASES.map((item) => item.kind).sort(),
      );
      await expect(page.locator('[data-node-banana-component="Header"]')).toContainText(graph.title, { timeout: 15_000 });
      await expect(page.locator('[data-node-banana-component="WorkflowCanvas"]')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator(".react-flow__node")).toHaveCount(20, { timeout: 30_000 });

      for (const nodeCase of SUPPORTED_NODE_CASES) {
        if (nodeCase.component) {
          await expect(page.locator(`[data-node-banana-component="${nodeCase.component}"]`)).toHaveCount(1);
        } else {
          await expect(page.getByRole("article", { name: nodeCase.title, exact: true })).toHaveCount(1);
        }
      }

      const saved = await readWorkflowViaApi(page, graph.id);
      expect(saved.nodes.map((node) => node.kind).sort()).toEqual(SUPPORTED_NODE_CASES.map((item) => item.kind).sort());
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator(".react-flow__node")).toHaveCount(20, { timeout: 30_000 });
      await captureEvidenceScreenshot(page, test.info(), "twenty-node-inventory-reload");
      expect(errors, errors.join("\n")).toEqual([]);
    } finally {
      await deleteWorkflowViaApi(page, graph.id);
    }
  });

  test("real pointer marquee and drag remain bounded and persist a graph change", async ({ page }) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await page.addInitScript(() => {
        window.localStorage.setItem("node-studio.canvas-settings", JSON.stringify({
          panMode: "space",
          zoomMode: "altScroll",
          selectionMode: "shiftDrag",
        }));
      });
      await waitForFreshWorkflow(page, graph);

      const canvas = page.locator('[data-node-banana-component="WorkflowCanvas"]');
      await addNodeFromToolbar(page, "Image");
      const first = canvas.locator(".react-flow__node").nth(0);
      await expect(first).toHaveCount(1);
      const viewport = page.viewportSize();
      const firstDistance = (viewport?.width ?? 0) < 600 ? { x: 0, y: -160 } : { x: -420, y: 0 };
      const secondDistance = (viewport?.width ?? 0) < 600 ? { x: 0, y: 160 } : { x: 260, y: 0 };
      await dragNodeByArticleBorder(page, first, firstDistance);
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
      await dragNodeByArticleBorder(page, nodes.nth(1), secondDistance);

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
        await expect(page.locator('[data-node-banana-component="MultiSelectToolbar"]')).toHaveCount(0);
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
        await expect(page.locator('[data-node-banana-component="MultiSelectToolbar"]')).toBeVisible();
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
      await expect(page.locator('[data-node-banana-component="WorkflowCanvas"] .react-flow__node')).toHaveCount(2, { timeout: 15_000 });
      const reloaded = await readWorkflowViaApi(page, graph.id);
      expect(reloaded.nodes.find((node) => node.id === promptBeforeDrag.id)?.position).toEqual(promptAfterDrag.position);
      await captureEvidenceScreenshot(page, test.info(), "pointer-reload");
      expect(errors, errors.join("\n")).toEqual([]);
    } finally {
      await deleteWorkflowViaApi(page, graph.id);
    }
  });

  test("toolbar menus dismiss outside, switch exclusively, and still add nodes", async ({ page }) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await waitForFreshWorkflow(page, graph);
      const generate = page.getByRole("button", { name: "Generate", exact: true });
      const allNodes = page.getByRole("button", { name: "All nodes", exact: true });
      const pane = page.locator(".react-flow__pane");
      await generate.click();
      await expect(generate).toHaveAttribute("aria-expanded", "true");
      await pane.click({ position: { x: 8, y: 8 } });
      await expect(generate).toHaveAttribute("aria-expanded", "false");
      await allNodes.click();
      await pane.click({ position: { x: 8, y: 8 } });
      await expect(allNodes).toHaveAttribute("aria-expanded", "false");
      await generate.click();
      await allNodes.click();
      await expect(generate).toHaveAttribute("aria-expanded", "false");
      await expect(allNodes).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Escape");
      await expect(allNodes).toHaveAttribute("aria-expanded", "false");
      await expect(allNodes).toBeFocused();
      await addNodeFromAllNodes(page, "Prompt");
      await expect(page.locator(".react-flow__node")).toHaveCount(1);
      await generate.click();
      await nodeBody(page, "Prompt").locator("textarea").click();
      await expect(generate).toHaveAttribute("aria-expanded", "false");
      expect(errors, errors.join("\n")).toEqual([]);
    } finally { await deleteWorkflowViaApi(page, graph.id); }
  });

  test("the upstream Edge toolbar pauses, resumes, deletes, and persists across reload", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Edge toolbar persistence is covered on the desktop canvas; mobile toolbar placement is covered by the responsive dialog test.");
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await waitForFreshWorkflow(page, graph);
      const canvas = page.locator('[data-node-banana-component="WorkflowCanvas"]');
      await addNodeFromToolbar(page, "Image");
      await addNodeFromAllNodes(page, "Image Resize");
      await expect(canvas.locator(".react-flow__node")).toHaveCount(2, { timeout: 15_000 });
      const sourceNode = reactFlowNodeForArticle(page, "Image Input");
      const targetNode = reactFlowNodeForArticle(page, "Image Resize");
      await dragNodeByArticleBorder(page, targetNode, { x: 500, y: 0 });
      await fitCanvas(page);
      await connectImageHandles(page, sourceNode, targetNode);
      const connected = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.edges.length === 1,
        "Image Input to Image Resize edge was not persisted",
      );
      const edgeRecord = connected.edges[0];
      expect(edgeRecord).toBeTruthy();
      if (!edgeRecord) throw new Error("edge record is missing");

      const selectEdge = async () => {
        const edge = canvas.locator(`.react-flow__edge[data-id="${edgeRecord.id}"]`);
        const interaction = edge.locator(".react-flow__edge-interaction").first();
        await expect(interaction).toBeAttached({ timeout: 15_000 });
        await interaction.click({ force: true });
        const toolbar = page.getByRole("toolbar", { name: "Selected edge" });
        await expect(toolbar).toBeVisible({ timeout: 10_000 });
        return toolbar;
      };

      let toolbar = await selectEdge();
      const pause = toolbar.getByRole("button", { name: "Add pause" });
      await pause.click();
      await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.edges.some((edge) => edge.id === edgeRecord.id && edge.hasPause === true),
        "Pause edge action was not persisted",
      );
      await expect(toolbar.getByRole("button", { name: "Remove pause" })).toBeEnabled();

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(canvas).toBeVisible({ timeout: 15_000 });
      await fitCanvas(page);
      toolbar = await selectEdge();
      await expect(toolbar.getByRole("button", { name: "Remove pause" })).toBeEnabled();
      await toolbar.getByRole("button", { name: "Remove pause" }).click();
      await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.edges.some((edge) => edge.id === edgeRecord.id && edge.hasPause !== true),
        "Resume edge action was not persisted",
      );
      await expect(toolbar.getByRole("button", { name: "Add pause" })).toBeEnabled();

      await toolbar.getByRole("button", { name: "Delete edge" }).click();
      await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => !snapshot.edges.some((edge) => edge.id === edgeRecord.id),
        "Delete edge action was not persisted",
      );
      await expect(page.getByRole("toolbar", { name: "Selected edge" })).toBeHidden();
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(canvas).toBeVisible({ timeout: 15_000 });
      await expect(canvas.locator(`.react-flow__edge[data-id="${edgeRecord.id}"]`)).toHaveCount(0);
      await captureEvidenceScreenshot(page, testInfo, "edge-toolbar-persistence-reload");
      expect(errors, errors.join("\n")).toEqual([]);
    } finally {
      await deleteWorkflowViaApi(page, graph.id);
    }
  });

  test("desktop and 390px dialogs/popovers expose usable focus and stay within the viewport", async ({ page }) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await waitForFreshWorkflow(page, graph);

      const allNodes = await openAllNodes(page);
      await expect(allNodes).toBeVisible();
      const allNodesBox = await allNodes.boundingBox();
      const viewport = page.viewportSize();
      expect(allNodesBox).not.toBeNull();
      expect(viewport).not.toBeNull();
      expect((allNodesBox?.x ?? 0) + (allNodesBox?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
      expect((allNodesBox?.y ?? 0) + (allNodesBox?.height ?? 0)).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
      await page.getByRole("button", { name: "All nodes" }).click();
      await expect(allNodes).toBeHidden();

      await page.getByRole("button", { name: "All models" }).click();
      const models = page.getByRole("dialog", { name: "All models" });
      await expect(models).toBeVisible();
      const search = models.getByRole("textbox", { name: "Search models" });
      await expect(search).toBeFocused();
      const modelsBox = await models.boundingBox();
      expect(modelsBox).not.toBeNull();
      expect((modelsBox?.x ?? 0) + (modelsBox?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
      expect((modelsBox?.y ?? 0) + (modelsBox?.height ?? 0)).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
      await page.keyboard.press("Escape");
      await expect(models).toBeHidden();

      await page.getByRole("button", { name: "Space settings" }).click();
      const settings = page.getByRole("dialog", { name: "Space Settings" });
      await expect(settings).toBeVisible();
      const settingsBox = await settings.boundingBox();
      expect(settingsBox).not.toBeNull();
      expect((settingsBox?.x ?? 0) + (settingsBox?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
      expect((settingsBox?.y ?? 0) + (settingsBox?.height ?? 0)).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
      await settings.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(settings).toBeHidden();

      await captureEvidenceScreenshot(page, test.info(), "dialogs");
      expect(errors, errors.join("\n")).toEqual([]);
    } finally {
      await deleteWorkflowViaApi(page, graph.id);
    }
  });

  test("generation Nodes use hosted Browse, explicit Expand, prompt precedence, and durable authoring", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "The mobile dialog/viewport path is covered by the dedicated responsive test.");
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await waitForFreshWorkflow(page, graph);
      const canvas = page.locator('[data-node-banana-component="WorkflowCanvas"]');
      for (const label of ["Generate Image", "Generate Video", "Generate Audio", "Prompt"]) {
        await addNodeFromAllNodes(page, label);
      }
      await expect(canvas.locator(".react-flow__node")).toHaveCount(4, { timeout: 15_000 });
      await fitCanvas(page);

      const created = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => ["generate.image", "generate.video", "generate.audio", "input.prompt"]
          .every((kind) => snapshot.nodes.some((node) => node.kind === kind)),
        "generation and Prompt nodes were not persisted",
      );
      const recordFor = (kind) => {
        const record = created.nodes.find((node) => node.kind === kind);
        if (!record) throw new Error(`missing ${kind}`);
        return record;
      };
      const laidOut = created.nodes.map((node, index) => ({
        ...node,
        position: {
          x: (index % 2) * 720,
          y: Math.floor(index / 2) * 780,
        },
      }));
      await replaceWorkflowViaApi(page, graph.id, laidOut, created.edges);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(canvas).toBeVisible({ timeout: 15_000 });
      await fitCanvas(page);
      const cases = [
        { kind: "generate.image", label: "Generate Image", option: "Gradio", modelKey: "mrfakename-z-image-turbo-v2" },
        { kind: "generate.video", label: "Generate Video", option: "Wan 2.2 (HF Space)", modelKey: "wan2-2-hf" },
        { kind: "generate.audio", label: "Generate Audio", option: "Faster Qwen3-TTS (Gradio)", modelKey: "leey00nsu-qwen-3.5-tts-faster-gradio" },
      ];

      for (const item of cases) {
        const record = recordFor(item.kind);
        const body = nodeBody(page, item.label);
        await expect(body).toBeVisible();
        await body.click({ position: { x: 18, y: 18 }, force: true });
        const header = page.locator(
          `[data-node-banana-component="FloatingNodeHeader"][data-node-id="${record.id}"]`,
        );
        await expect(header).toBeVisible();
        const settingsToggle = body.getByRole("button", { name: "Expand parameters" });
        await expect(settingsToggle).toHaveAttribute("aria-expanded", "false");
        await settingsToggle.focus();
        await page.keyboard.press("Enter");
        await expect(body.getByRole("button", { name: "Collapse parameters" })).toHaveAttribute("aria-expanded", "true");

        const browseModels = header.getByRole("button", { name: "Browse models" });
        await browseModels.focus();
        await expect(browseModels).toBeFocused();
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog", { name: "Browse Models" });
        await expect(dialog).toBeVisible();
        const modelOption = dialog.getByRole("button", { name: item.option, exact: false }).filter({ has: page.getByText(item.modelKey, { exact: true }) });
        await expect(modelOption).toBeVisible();
        await modelOption.click();
        await expect(dialog).toBeHidden();
        await waitForWorkflowState(
          page,
          graph.id,
          (snapshot) => snapshot.nodes.some((node) => node.id === record.id && node.config?.modelKey === item.modelKey),
          `${item.kind} Browse selection was not persisted`,
        );
        // Clicking alone cannot detect a collapsed body or overlapping settings.
        // Measure settled layout through repeated actual inline-panel toggles.
        await fitCanvas(page);
        for (let repeat = 0; repeat < 3; repeat += 1) {
          await body.getByRole("button", { name: "Collapse parameters" }).click();
          await expect(body.getByRole("button", { name: "Expand parameters" })).toBeVisible();
          await expect.poll(() => body.locator('[id^="params-"]').evaluate((el) => el.getBoundingClientRect().height)).toBe(0);
          const collapsed = await body.boundingBox();
          await body.getByRole("button", { name: "Expand parameters" }).click();
          await expect.poll(async () => {
            const expanded = await body.boundingBox();
            return expanded.height - collapsed.height;
          }).toBeGreaterThan(10);
          await expect.poll(() => body.evaluate((el) => {
            const panel = el.querySelector('[id^="params-"]');
            const toggle = el.querySelector('[aria-controls^="params-"]');
            const prompt = el.querySelector('textarea[aria-label="Prompt"]');
            const bounds = el.getBoundingClientRect();
            return panel.getBoundingClientRect().bottom <= bounds.bottom + 2
              && prompt.getBoundingClientRect().bottom <= toggle.getBoundingClientRect().top + 2;
          })).toBe(true);
        }
      }

      const imageRecord = recordFor("generate.image");
      const imageBody = nodeBody(page, "Generate Image");
      const imagePrompt = imageBody.getByRole("textbox", { name: "Prompt" });
      await imagePrompt.fill("durable local prompt");
      await imagePrompt.blur();
      await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) => node.id === imageRecord.id && node.config?.prompt === "durable local prompt"),
        "local generation prompt was not persisted",
      );

      await imageBody.click({ position: { x: 18, y: 18 } });
      const imageHeader = page.locator(
        `[data-node-banana-component="FloatingNodeHeader"][data-node-id="${imageRecord.id}"]`,
      );
      await expect(imageHeader.getByTitle("Run this node")).toBeEnabled();

      // Switching model/provider must drop the previous HF schema snapshot.
      await imageHeader.getByRole("button", { name: "Browse models" }).click();
      const imageModels = page.getByRole("dialog", { name: "Browse Models" });
      await imageModels.getByRole("button", { name: /GPT Image 2 Bridge/ }).filter({ has: page.getByText("gpt-image-2-bridge", { exact: true }) }).click();
      const switched = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) => node.id === imageRecord.id && node.config?.modelKey === "gpt-image-2-bridge"),
        "image model switch was not persisted",
      );
      const switchedImage = switched.nodes.find((node) => node.id === imageRecord.id);
      expect(Object.keys(switchedImage?.config?.parameters ?? {}).some((key) => key.startsWith("hf:"))).toBeFalsy();

      const promptRecord = recordFor("input.prompt");
      const promptBody = nodeBody(page, "Prompt");
      await promptBody.click({ position: { x: 18, y: 18 } });
      const promptHeader = page.locator(
        `[data-node-banana-component="FloatingNodeHeader"][data-node-id="${promptRecord.id}"]`,
      );
      await expect(promptHeader.getByTitle("Expand editor")).toBeVisible();
      const promptTextarea = promptBody.locator("textarea");
      await promptTextarea.fill("connected prompt wins");
      await promptTextarea.blur();
      await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) => node.id === promptRecord.id && node.config?.text === "connected prompt wins"),
        "Prompt node text was not persisted",
      );
      await connectHandles(
        page,
        reactFlowNodeForArticle(page, "Prompt"),
        reactFlowNodeForArticle(page, "Generate Image"),
        "text",
        "text",
      );
      await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.edges.some((edge) =>
          edge.sourceNodeId === promptRecord.id &&
          edge.targetNodeId === imageRecord.id &&
          edge.sourcePortId === "text" &&
          edge.targetPortId === "prompt"),
        "Prompt to generation connection was not persisted",
      );
      await expect(imagePrompt).toBeDisabled();
      await expect(imagePrompt).toHaveValue("connected prompt wins");
      await expect(imageBody.getByText("Controlled by connected Prompt node")).toBeVisible();

      const videoRecord = recordFor("generate.video");
      await nodeBody(page, "Generate Video").click({ position: { x: 18, y: 18 } });
      const videoHeader = page.locator(
        `[data-node-banana-component="FloatingNodeHeader"][data-node-id="${videoRecord.id}"]`,
      );
      await expect(videoHeader.getByRole("button", { name: /Run node unavailable/ })).toHaveAttribute(
        "title",
        /Run node unavailable: .+/,
      );

      await page.getByRole("button", { name: "Save space", exact: true }).click();
      await expect(page.locator('[data-node-banana-component="Header"] [role="status"]').filter({ hasText: /^Saved$/ })).toBeVisible({ timeout: 30_000 });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(canvas).toBeVisible({ timeout: 15_000 });
      await fitCanvas(page);
      const reloadedImagePrompt = nodeBody(page, "Generate Image").getByRole("textbox", { name: "Prompt" });
      await expect(reloadedImagePrompt).toBeDisabled();
      await expect(reloadedImagePrompt).toHaveValue("connected prompt wins");
      const reloaded = await readWorkflowViaApi(page, graph.id);
      expect(reloaded.nodes.find((node) => node.id === imageRecord.id)?.config?.prompt).toBe("durable local prompt");
      expect(reloaded.nodes.find((node) => node.id === imageRecord.id)?.config?.modelKey).toBe("gpt-image-2-bridge");
      expect(reloaded.nodes.find((node) => node.id === videoRecord.id)?.config?.modelKey).toBe("wan2-2-hf");
      expect(reloaded.nodes.find((node) => node.id === recordFor("generate.audio").id)?.config?.modelKey).toBe("leey00nsu-qwen-3.5-tts-faster-gradio");
      await captureEvidenceScreenshot(page, testInfo, "generation-authoring-reload");
      expect(errors, errors.join("\n")).toEqual([]);
    } finally {
      await deleteWorkflowViaApi(page, graph.id);
    }
  });

  test("each generation media preserves its preview when inline Settings expands", async ({ page }, testInfo) => {
    const errors = attachErrorCapture(page);
    for (const item of [
      { label: "Generate Image", modelKey: "mrfakename-z-image-turbo-v2", option: "Gradio" },
      { label: "Generate Video", modelKey: "wan2-2-hf", option: "Wan 2.2 (HF Space)" },
      { label: "Generate Audio", modelKey: "leey00nsu-qwen-3.5-tts-faster-gradio", option: "Faster Qwen3-TTS (Gradio)" },
    ]) {
      const graph = await createWorkflowViaApi(page);
      try {
        await waitForFreshWorkflow(page, graph);
        await addNodeFromAllNodes(page, item.label);
        const body = nodeBody(page, item.label);
        await expect(body).toBeVisible();
        await fitCanvas(page);
        await body.getByRole("textbox", { name: "Prompt" }).click();
        const browse = page.getByRole("button", { name: "Browse models" });
        await browse.click();
        const models = page.getByRole("dialog", { name: "Browse Models" });
        await models.getByRole("button", { name: item.option, exact: false }).filter({ has: page.getByText(item.modelKey, { exact: true }) }).click();
        await expect(models).toBeHidden();
        for (let repeat = 0; repeat < 3; repeat += 1) {
          const collapsed = await body.boundingBox();
          const samplePreview = () => body.evaluate((el) => {
            const prompt = el.querySelector('textarea[aria-label="Prompt"]');
            const content = prompt.closest("label").parentElement;
            const preview = content.lastElementChild;
            el.settingsSamples = [preview.offsetHeight];
            el.settingsSamplingDone = false;
            const start = performance.now();
            const sample = () => {
              el.settingsSamples.push(preview.offsetHeight);
              if (performance.now() - start < 600) requestAnimationFrame(sample);
              else el.settingsSamplingDone = true;
            };
            requestAnimationFrame(sample);
          });
          const assertStablePreview = async () => {
            await expect.poll(() => body.evaluate((el) => el.settingsSamplingDone)).toBe(true);
            const heights = await body.evaluate((el) => el.settingsSamples);
            expect(heights.length).toBeGreaterThan(3);
            expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2);
          };
          await samplePreview();
          await body.getByRole("button", { name: "Expand parameters" }).click();
          await assertStablePreview();
          await expect.poll(async () => (await body.boundingBox()).height - collapsed.height).toBeGreaterThan(10);
          await expect.poll(() => body.evaluate((el) => {
            const panel = el.querySelector('[id^="params-"]');
            const toggle = el.querySelector('[aria-controls^="params-"]');
            const prompt = el.querySelector('textarea[aria-label="Prompt"]');
            const content = prompt.closest("label").parentElement;
            const bounds = el.getBoundingClientRect();
            return panel.getBoundingClientRect().bottom <= bounds.bottom + 2
              && content.getBoundingClientRect().bottom <= toggle.getBoundingClientRect().top + 2
              && [...content.children].every((child) => child.getBoundingClientRect().bottom <= toggle.getBoundingClientRect().top + 2);
          })).toBe(true);
          if (repeat === 0) await captureEvidenceScreenshot(page, testInfo, `settings-${item.label.toLowerCase().replaceAll(" ", "-")}`);
          const collapse = body.getByRole("button", { name: "Collapse parameters" });
          await collapse.focus();
          await samplePreview();
          await collapse.press("Enter");
          await assertStablePreview();
          await expect.poll(() => body.locator('[id^="params-"]').evaluate((el) => el.getBoundingClientRect().height)).toBe(0);
          await expect.poll(async () => Math.abs((await body.boundingBox()).height - collapsed.height)).toBeLessThan(2);
        }
        const beforeResize = await body.boundingBox();
        // Close before the 160ms expansion reservation commits: removing an
        // observed-but-unapplied panel height must never shrink the preview.
        for (const delay of [0, 50, 100]) {
          await body.getByRole("button", { name: "Expand parameters" }).focus();
          await page.keyboard.press("Enter");
          if (delay) await page.waitForTimeout(delay);
          await page.keyboard.press("Enter");
          await expect(body.getByRole("button", { name: "Expand parameters" })).toBeVisible();
          await page.waitForTimeout(250);
          expect(Math.abs((await body.boundingBox()).height - beforeResize.height)).toBeLessThan(2);
        }
        const flowNode = body.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' react-flow__node ')][1]");
        const handle = flowNode.locator(".react-flow__resize-control.handle.bottom.right");
        await expect(handle).toBeVisible();
        const corner = await handle.boundingBox();
        await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
        await page.mouse.down();
        await page.mouse.move(corner.x + corner.width / 2 + 20, corner.y + corner.height / 2 + 24, { steps: 8 });
        await page.mouse.up();
        await expect.poll(async () => (await body.boundingBox()).width - beforeResize.width).toBeGreaterThan(10);
        const resized = await body.boundingBox();
        await body.getByRole("button", { name: "Expand parameters" }).click();
        await expect.poll(async () => (await body.boundingBox()).height - resized.height).toBeGreaterThan(10);
        await body.getByRole("button", { name: "Collapse parameters" }).focus();
        await page.keyboard.press("Enter");
        await expect.poll(async () => Math.abs((await body.boundingBox()).height - resized.height)).toBeLessThan(2);
        for (const enabled of [false, true]) {
          await page.getByRole("button", { name: "Space settings", exact: true }).click();
          const settings = page.getByRole("dialog", { name: "Space Settings", exact: true });
          const toggle = settings.getByRole("switch", { name: "Show model settings on nodes" });
          if ((await toggle.getAttribute("aria-checked")) !== String(enabled)) await toggle.click();
          await settings.getByRole("button", { name: "Save", exact: true }).click();
          await expect(settings).not.toBeVisible();
          await expect(body.locator('[id^="params-"]')).toHaveCount(enabled ? 1 : 0);
          const sidePanel = page.getByRole("region", { name: `${item.label} Settings`, exact: true });
          const parameter = item.label === "Generate Image" ? { key: "width", label: /^Width/, value: "768" }
            : item.label === "Generate Video" ? { key: "durationSec", label: /^DurationSec/, value: "4" }
            : { key: "seed", label: /^Seed$/, value: "123" };
          if (!enabled) {
            await expect(sidePanel).toBeVisible();
            const field = sidePanel.locator("label").filter({ hasText: parameter.label }).locator("..").locator("input");
            await field.fill(parameter.value); await field.blur();
            await waitForWorkflowState(page, graph.id, (value) => String(value.nodes[0].config.parameters[parameter.key]) === parameter.value, "side panel edit was not saved");
          } else await expect(sidePanel).not.toBeVisible();
          await page.reload(); await waitForFreshWorkflow(page, graph);
          await expect(body.locator('[id^="params-"]')).toHaveCount(enabled ? 1 : 0);
          if (!enabled) {
            await body.getByRole("textbox", { name: "Prompt" }).click();
            await expect(sidePanel.locator("label").filter({ hasText: parameter.label }).locator("..").locator("input")).toHaveValue(parameter.value);
            await captureEvidenceScreenshot(page, testInfo, `side-panel-${item.label.toLowerCase().replaceAll(" ", "-")}`);
          }
        }
      } finally { await page.goto("about:blank"); await deleteWorkflowViaApi(page, graph.id); }
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("real generation Run submits image/audio/video jobs, projects durable outputs, and reloads", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    test.skip(testInfo.project.name !== "desktop", "Generation provider submissions run once on desktop; the dedicated 390px test covers responsive controls.");
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await waitForFreshWorkflow(page, graph);
      const canvas = page.locator('[data-node-banana-component="WorkflowCanvas"]');
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
      const generationCases = [
        { kind: "generate.image", label: "Generate Image", mediaType: "image", option: "Gradio", modelKey: "mrfakename-z-image-turbo-v2", prompt: "a tiny deterministic crimson kite" },
        { kind: "generate.audio", label: "Generate Audio", mediaType: "audio", option: "Faster Qwen3-TTS (Gradio)", modelKey: "leey00nsu-qwen-3.5-tts-faster-gradio", prompt: "A short deterministic spoken tone" },
        { kind: "generate.video", label: "Generate Video", mediaType: "video", option: "Wan 2.2 (HF Space)", modelKey: "wan2-2-hf", prompt: "A tiny deterministic red kite moving slowly" },
      ];
      const generationRecordFor = (kind) => {
        const record = created.nodes.find((node) => node.kind === kind);
        if (!record) throw new Error(`missing ${kind}`);
        return record;
      };
      const generationNodeFor = (label) => nodeBody(page, label)
        .locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' react-flow__node ')][1]")
        .first();
      const outputBodies = canvas.locator('[data-node-banana-component="OutputNode"]');
      const outputNodeFor = (index) => outputBodies.nth(index)
        .locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' react-flow__node ')][1]")
        .first();
      await fitCanvas(page);

      for (const item of generationCases) {
        const record = generationRecordFor(item.kind);
        const body = nodeBody(page, item.label);
        await expect(body).toBeVisible();
        await body.click({ position: { x: 18, y: 18 }, force: true });
        const header = page.locator(
          `[data-node-banana-component="FloatingNodeHeader"][data-node-id="${record.id}"]`,
        );
        await expect(header).toBeVisible();
        await header.getByRole("button", { name: "Browse models" }).click();
        const dialog = page.getByRole("dialog", { name: "Browse Models" });
        await expect(dialog).toBeVisible();
        await dialog.getByRole("button", { name: item.option, exact: false }).filter({ has: page.getByText(item.modelKey, { exact: true }) }).click();
        await expect(dialog).toBeHidden();
        await waitForWorkflowState(
          page,
          graph.id,
          (snapshot) => snapshot.nodes.some((node) => node.id === record.id && node.config?.modelKey === item.modelKey),
          `${item.kind} model selection was not persisted before Run`,
        );
        const prompt = body.getByRole("textbox", { name: "Prompt" });
        await prompt.fill(item.prompt);
        await prompt.blur();
        await waitForWorkflowState(
          page,
          graph.id,
          (snapshot) => snapshot.nodes.some((node) => node.id === record.id && node.config?.prompt === item.prompt),
          `${item.kind} prompt was not persisted before Run`,
        );

        if (item.kind === "generate.video") {
          const imageInputBody = nodeBody(page, "Image Input");
          await imageInputBody.locator('input[type="file"]').setInputFiles({
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
          await prompt.fill("");
          await prompt.blur();
          await waitForWorkflowState(
            page,
            graph.id,
            (snapshot) => snapshot.nodes.some((node) => node.id === record.id && node.config?.prompt === ""),
            "video prompt clear was not persisted for invalid-readiness coverage",
          );
          await body.click({ position: { x: 18, y: 18 }, force: true });
          const unavailable = header.getByRole("button", { name: "Run node unavailable: Enter a prompt or connect a Prompt node." });
          await expect(unavailable).toBeDisabled();
          await expect(unavailable).toHaveAttribute("title", "Run node unavailable: Enter a prompt or connect a Prompt node.");
          await prompt.fill(item.prompt);
          await prompt.blur();
          await waitForWorkflowState(
            page,
            graph.id,
            (snapshot) => snapshot.nodes.some((node) => node.id === record.id && node.config?.prompt === item.prompt),
            "video prompt restore was not persisted before Run",
          );
        }
      }

      const outputRecords = created.nodes.filter((node) => node.kind === "output.single");
      for (const [index, item] of generationCases.entries()) {
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
            snapshot.edges.some((edge) => edge.targetNodeId === generationRecordFor("generate.video").id && edge.targetPortId === "initImage");
        },
        "generation outputs were not connected to their downstream Output nodes",
        30_000,
      );
      expect(connected.nodes.filter((node) => node.kind === "output.single")).toHaveLength(3);

      const generatedAssets = [];
      for (const [index, item] of generationCases.entries()) {
        const record = generationRecordFor(item.kind);
        const body = nodeBody(page, item.label);
        await body.click({ position: { x: 18, y: 18 }, force: true });
        const header = page.locator(
          `[data-node-banana-component="FloatingNodeHeader"][data-node-id="${record.id}"]`,
        );
        const started = await runHostedGeneration(page, graph.id, record.id, header, 60_000);
        expect(started.outputAssetIds).toHaveLength(1);
        const assetId = started.outputAssetIds[0];
        const assetResponse = await page.request.get(`/api/media-assets/${encodeURIComponent(assetId)}`);
        expect(assetResponse.ok(), `generated ${item.mediaType} asset read failed: ${assetResponse.status()}`).toBeTruthy();
        const assetPayload = await assetResponse.json();
        expect(assetPayload.asset).toMatchObject({ id: assetId, type: item.mediaType, origin: "generation", status: "completed" });
        expect(assetPayload.asset.url).toMatch(/^https:\/\//);
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
        // The upstream audio node uses a waveform and a detached Audio instance,
        // not an <audio> element. Verify its actual player without changing the UI.
        const preview = item.mediaType === "audio" ? body.locator("canvas")
          : item.mediaType === "image" ? body.locator('img[alt="Generated"]') : body.locator("video");
        await expect(preview).toBeAttached({ timeout: 30_000 });
        if (item.mediaType === "video") await expectPlayableVideo(preview, assetId);
        if (item.mediaType === "audio") {
          await expect(body.getByRole("button", { name: "Download audio", exact: true })).toBeAttached();
          await body.getByRole("button", { name: "Play", exact: true }).click();
          await expect(body.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
          await body.getByRole("button", { name: "Pause", exact: true }).click();
        }
        const outputBody = outputBodies.nth(index);
        await expect(outputBody.locator(item.mediaType === "image" ? "img" : item.mediaType)).toBeAttached({ timeout: 30_000 });
        if (item.mediaType === "video") await expectPlayableVideo(outputBody.locator("video"), assetId);
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
      for (const { item, record, assetId, digest } of generatedAssets) {
        const body = nodeBody(page, item.label);
        const reloadedPreview = item.mediaType === "audio" ? body.locator("canvas")
          : item.mediaType === "image" ? body.locator('img[alt="Generated"]') : body.locator("video");
        await expect(reloadedPreview).toBeAttached({ timeout: 30_000 });
        if (item.mediaType === "video") await expectPlayableVideo(reloadedPreview, assetId);
        const restored = await readWorkflowViaApi(page, graph.id);
        expect(restored.nodes.find((node) => node.id === record.id)?.selectedOutputAssetId).toBe(assetId);
        expect(await mediaAssetDigest(page, assetId)).toBe(digest);
      }
      for (const [index, item] of generationCases.entries()) {
        await expect(outputBodies.nth(index).locator(item.mediaType === "image" ? "img" : item.mediaType)).toBeAttached({ timeout: 30_000 });
        if (item.mediaType === "video") await expectPlayableVideo(outputBodies.nth(index).locator("video"), generatedAssets[index].assetId);
      }
      await captureEvidenceScreenshot(page, testInfo, "generation-run-output-reload");
      expect(errors, errors.join("\n")).toEqual([]);
    } finally {
      await deleteWorkflowViaApi(page, graph.id);
    }
  });

  test("Remove Background runs through the hosted toolbar into a durable downstream image", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    test.skip(testInfo.project.name !== "desktop", "Background-removal worker coverage runs once on desktop; mobile responsiveness is covered by the dedicated 390px controls test.");
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await waitForFreshWorkflow(page, graph);
      const canvas = page.locator('[data-node-banana-component="WorkflowCanvas"]');
      await addNodeFromToolbar(page, "Image");
      const inputBody = nodeBody(page, "Image Input");
      const inputNode = reactFlowNodeForArticle(page, "Image Input");
      await inputBody.locator('input[type="file"]').setInputFiles({
        name: "t25-background-source.png",
        mimeType: "image/png",
        buffer: deterministicPng(40, 32, 2),
      });
      await expect(inputBody.locator("img")).toBeVisible({ timeout: 30_000 });
      const uploaded = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) => node.kind === "input.image" && typeof node.config?.assetId === "string" && node.config.assetId.length > 0),
        "background-removal source image did not persist",
        30_000,
      );
      const inputRecord = uploaded.nodes.find((node) => node.kind === "input.image");
      const sourceAssetId = inputRecord?.config?.assetId;
      expect(sourceAssetId).toEqual(expect.any(String));

      // The real hosted palette exposes this only when the model catalog has a
      // background-removal capability. The E2E server advertises its isolated
      // deterministic processor through that same capability gate.
      await expect.poll(() => paletteHasNode(page, "Remove Background"), {
        timeout: 15_000,
        message: "Remove Background is not exposed by the hosted capability catalog",
      }).toBeTruthy();
      await addNodeFromAllNodes(page, "Remove Background");
      await expect(canvas.locator(".react-flow__node")).toHaveCount(2, { timeout: 15_000 });
      const removeBody = nodeBody(page, "Remove Background");
      const removeNode = reactFlowNodeForArticle(page, "Remove Background");
      await expect(removeBody).toBeVisible();
      await dragNodeByArticleBorder(page, removeNode, { x: 500, y: 0 });
      await fitCanvas(page);
      await connectImageHandles(page, inputNode, removeNode);
      const connected = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => {
          const target = snapshot.nodes.find((node) => node.kind === "edit.image.removeBackground");
          return Boolean(target) && snapshot.edges.some((edge) => edge.targetNodeId === target.id && edge.targetPortId === "image");
        },
        "Image Input to Remove Background connection was not persisted",
      );
      const removeRecord = connected.nodes.find((node) => node.kind === "edit.image.removeBackground");
      expect(removeRecord).toBeTruthy();
      if (!removeRecord || typeof sourceAssetId !== "string") throw new Error("Remove Background fixture is missing its source");

      await addNodeFromToolbar(page, "Output");
      await expect(canvas.locator(".react-flow__node")).toHaveCount(3, { timeout: 15_000 });
      const outputNode = reactFlowNodeForArticle(page, "Output");
      await fitCanvas(page);
      await connectImageHandles(page, removeNode, outputNode);
      const withOutput = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => {
          const output = snapshot.nodes.find((node) => node.kind === "output.single");
          return Boolean(output) && snapshot.edges.some((edge) => edge.targetNodeId === output.id && edge.sourceNodeId === removeRecord.id);
        },
        "Remove Background downstream Output connection was not persisted",
      );
      const outputRecord = withOutput.nodes.find((node) => node.kind === "output.single");
      expect(outputRecord).toBeTruthy();
      if (!outputRecord) throw new Error("Remove Background output node is missing");

      await removeNode.click({ position: { x: 18, y: 18 } });
      const header = page.locator(
        `[data-node-banana-component="FloatingNodeHeader"][data-node-id="${removeRecord.id}"]`,
      );
      await expect(header.getByRole("button", { name: "Run this node" })).toBeEnabled({ timeout: 30_000 });
      const started = await runBrowserMediaOperation(
        page,
        graph.id,
        removeRecord.id,
        header.getByRole("button", { name: "Run this node" }),
        60_000,
      );
      expect(started.executionKind).toBe("media_operation");
      expect(started.outputAssetIds).toHaveLength(1);
      const outputAssetId = started.outputAssetIds[0];
      expect(outputAssetId).toEqual(expect.any(String));
      const outputAsset = await page.request.get(`/api/media-assets/${encodeURIComponent(outputAssetId)}`);
      expect(outputAsset.ok(), `background-removal output asset read failed: ${outputAsset.status()}`).toBeTruthy();
      const outputAssetPayload = (await outputAsset.json()).asset;
      expect(outputAssetPayload).toMatchObject({ id: outputAssetId, type: "image", origin: "media_operation", status: "completed" });
      expect(outputAssetPayload.url).toMatch(/^https:\/\//);
      const [sourceDigest, resultDigest] = await Promise.all([
        mediaAssetDigest(page, sourceAssetId),
        mediaAssetDigest(page, outputAssetId),
      ]);
      expect(resultDigest).not.toBe(sourceDigest);
      await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) => node.id === removeRecord.id && node.selectedOutputAssetId === outputAssetId),
        "Remove Background output was not selected durably",
      );
      await expect(removeBody.locator('img[alt="Background removed"]')).toBeVisible({ timeout: 30_000 });
      await expect(nodeBody(page, "Output").locator("img")).toBeVisible({ timeout: 30_000 });
      const downstream = await page.request.get(
        `/api/generation-graphs/${encodeURIComponent(graph.id)}/nodes/${encodeURIComponent(outputRecord.id)}/outputs`,
      );
      expect(downstream.ok(), `background-removal downstream resolve failed: ${downstream.status()}`).toBeTruthy();
      expect((await downstream.json()).output.groups).toEqual([
        expect.objectContaining({ portId: "image", assets: [expect.objectContaining({ id: outputAssetId })] }),
      ]);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(canvas).toBeVisible({ timeout: 15_000 });
      await fitCanvas(page);
      await expect(nodeBody(page, "Remove Background").locator('img[alt="Background removed"]')).toBeVisible({ timeout: 30_000 });
      await expect(nodeBody(page, "Output").locator("img")).toBeVisible({ timeout: 30_000 });
      const reloaded = await readWorkflowViaApi(page, graph.id);
      expect(reloaded.nodes.find((node) => node.id === removeRecord.id)?.selectedOutputAssetId).toBe(outputAssetId);
      await captureEvidenceScreenshot(page, testInfo, "remove-background-output-reload");
      const reloadedRemoveBody = nodeBody(page, "Remove Background");
      await reloadedRemoveBody.hover();
      await reloadedRemoveBody.getByRole("button", { name: "Clear result", exact: true }).click();
      await waitForWorkflowState(page, graph.id, (snapshot) =>
        snapshot.nodes.some((node) => node.id === removeRecord.id && node.selectedOutputAssetId === null),
      "Clear result did not clear canonical selection");
      await expect(nodeBody(page, "Output").locator("img")).toHaveCount(0);
      const clearedOutput = await page.request.get(
        `/api/generation-graphs/${encodeURIComponent(graph.id)}/nodes/${encodeURIComponent(outputRecord.id)}/outputs`,
      );
      expect(clearedOutput.ok()).toBeTruthy();
      expect((await clearedOutput.json()).output.groups.flatMap((group) => group.assets)).toEqual([]);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(canvas).toBeVisible({ timeout: 15_000 });
      await expect(nodeBody(page, "Output").locator("img")).toHaveCount(0);
      await expect(nodeBody(page, "Remove Background").locator('img[alt="Background removed"]')).toHaveCount(0);
      // Clear hides the selected result; it must not erase the durable history asset.
      expect((await page.request.get(`/api/media-assets/${encodeURIComponent(outputAssetId)}`)).ok()).toBeTruthy();
      expect(errors, errors.join("\n")).toEqual([]);
    } finally {
      await deleteWorkflowViaApi(page, graph.id);
    }
  });

  test("Image Input history modal selects a durable asset and restores focus for close, Download, and X", async ({ page }, testInfo) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await waitForFreshWorkflow(page, graph);
      const canvas = page.locator('[data-node-banana-component="WorkflowCanvas"]');
      await addNodeFromToolbar(page, "Image");
      const firstBody = canvas.locator('[data-node-banana-component="ImageInputNode"]').nth(0);
      await firstBody.locator('input[type="file"]').setInputFiles({
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
      const imageBodies = canvas.locator('[data-node-banana-component="ImageInputNode"]');
      await expect(imageBodies).toHaveCount(2, { timeout: 15_000 });
      const secondBody = imageBodies.nth(1);
      await secondBody.locator('input[type="file"]').setInputFiles({
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

      const historyTrigger = secondBody.getByRole("button", { name: "Connect image output", exact: true });
      await historyTrigger.click();
      await page.locator('[data-node-banana-component="ConnectionDropMenu"]').getByRole('button', { name: 'Assets', exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Assets" });
      await expect(dialog).toBeVisible();
      const search = dialog.locator('input[placeholder="Search loaded assets..."]');
      await expect(search).toBeFocused();
      await search.fill(String(firstAssetId));
      const matchingAsset = dialog.locator('button[aria-pressed]');
      await expect(matchingAsset).toHaveCount(1, { timeout: 30_000 });
      await expect(matchingAsset).toHaveAttribute("aria-pressed", "false");
      await matchingAsset.click();
      await expect(dialog).toBeHidden();
      await expect(page.locator('[data-node-banana-component="WorkflowCanvas"]')).toBeFocused();
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
      await page.locator('[data-node-banana-component="ConnectionDropMenu"]').getByRole('button', { name: 'Assets', exact: true }).click();
      await expect(dialog).toBeVisible();
      await expect(search).toBeFocused();
      await dialog.getByRole("button", { name: "Close assets" }).click();
      await expect(dialog).toBeHidden();
      await expect(canvas).toBeFocused();

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(canvas).toBeVisible({ timeout: 15_000 });
      const reloadedSecond = canvas.locator(`.react-flow__node[data-id="${secondRecord?.id}"] [data-node-banana-component="ImageInputNode"]`);
      await expect(reloadedSecond.locator("img")).toBeVisible({ timeout: 30_000 });
      const reloaded = await readWorkflowViaApi(page, graph.id);
      expect(reloaded.nodes.find((node) => node.id === secondRecord?.id)?.config?.assetId).toBe(firstAssetId);

      await reloadedSecond.hover();
      const download = reloadedSecond.getByRole("button", { name: "Download image" });
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
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(canvas).toBeVisible({ timeout: 15_000 });
      const restored = await readWorkflowViaApi(page, graph.id);
      expect(restored.nodes.find((node) => node.id === secondRecord?.id)?.config?.assetId).toBeNull();
      await expect(canvas.locator('[data-node-banana-component="ImageInputNode"]').nth(1).locator('input[type="file"]')).toBeAttached();
      await captureEvidenceScreenshot(page, testInfo, "image-history-modal-reload");
      expect(errors, errors.join("\n")).toEqual([]);
    } finally {
      await deleteWorkflowViaApi(page, graph.id);
    }
  });

  test("Annotation Done produces a changed durable output for a connected image and survives reload", async ({ page }) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await waitForFreshWorkflow(page, graph);
      const canvas = page.locator('[data-node-banana-component="WorkflowCanvas"]');

      await addNodeFromToolbar(page, "Image");
      await expect(canvas.locator(".react-flow__node")).toHaveCount(1, { timeout: 10_000 });
      const imageNode = reactFlowNodeForArticle(page, "Image Input");
      const imageArticle = nodeArticle(page, "Image Input");
      await expect(imageNode).toBeVisible();
      await expect(imageArticle.locator('input[type="file"]')).toBeAttached();
      await imageArticle.locator('input[type="file"]').setInputFiles({
        name: "t25-deterministic-source.png",
        mimeType: "image/png",
        buffer: deterministicPng(),
      });
      await expect(imageArticle.locator("img")).toBeVisible({ timeout: 30_000 });

      const withInput = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) => {
          if (node.kind !== "input.image" || !node.config || typeof node.config !== "object" || Array.isArray(node.config)) return false;
          return typeof node.config.assetId === "string" && node.config.assetId.length > 0;
        }),
        "uploaded image asset was not persisted to the input node",
        30_000,
      );
      const inputNode = withInput.nodes.find((node) => node.kind === "input.image");
      const sourceAssetId = inputNode && inputNode.config && typeof inputNode.config === "object" && !Array.isArray(inputNode.config)
        ? typeof inputNode.config.assetId === "string" ? inputNode.config.assetId : null
        : null;
      expect(sourceAssetId).toBeTruthy();

      await addNodeFromAllNodes(page, "Annotate");
      await expect(canvas.locator(".react-flow__node")).toHaveCount(2, { timeout: 10_000 });
      const annotationNode = reactFlowNodeForArticle(page, "Annotation");
      const annotationArticle = nodeArticle(page, "Annotation");
      await expect(annotationNode).toBeVisible();

      const viewport = page.viewportSize();
      await dragNodeByArticleBorder(
        page,
        annotationNode,
        (viewport?.width ?? 0) < 600 ? { x: 0, y: 140 } : { x: 340, y: 0 },
      );
      await connectImageHandles(page, imageNode, annotationNode);

      const withConnection = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.edges.some((edge) =>
          edge.sourceNodeId === inputNode?.id &&
          edge.targetNodeId === snapshot.nodes.find((node) => node.kind === "edit.image.annotation")?.id &&
          edge.sourcePortId === "image" &&
          edge.targetPortId === "image",
        ),
        "image input to annotation handle connection was not persisted",
        30_000,
      );
      const annotationRecord = withConnection.nodes.find((node) => node.kind === "edit.image.annotation");
      expect(annotationRecord).toBeTruthy();

      // Capture the source preview before opening the editor. Done should
      // immediately project the flattened canvas as a data URL while the
      // durable media operation is still being submitted.
      const sourcePreview = imageArticle.locator("img").first();
      await expect(sourcePreview).toBeVisible();
      const sourcePreviewSrc = await sourcePreview.getAttribute("src");
      expect(sourcePreviewSrc).toMatch(/^.+/);

      const openEditor = annotationArticle
        .getByRole("button", { name: "Add annotations", exact: true })
        .or(annotationArticle.getByRole("button", { name: /Edit \(\d+\)/ }))
        .first();
      await expect(openEditor).toBeEnabled();
      await openEditor.click();
      const editor = page.locator('[data-node-banana-component="AnnotationModal"]')
        .or(page.getByRole("dialog", { name: "Annotation editor" }))
        .first();
      await expect(editor).toBeVisible();
      const done = editor.getByRole("button", { name: "Done", exact: true });
      await expect(done).toBeEnabled({ timeout: 30_000 });
      const stage = editor.locator(".konvajs-content canvas").first();
      await expect(stage).toBeVisible();
      const stageBox = await stage.boundingBox();
      if (!stageBox) throw new Error("annotation Konva stage has no box");
      await editor.getByRole("button", { name: "Rect", exact: true }).click();
      const start = { x: stageBox.x + Math.min(24, stageBox.width / 4), y: stageBox.y + Math.min(24, stageBox.height / 4) };
      const end = { x: Math.min(stageBox.x + stageBox.width - 24, start.x + 96), y: Math.min(stageBox.y + stageBox.height - 24, start.y + 72) };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 24 });
      await page.mouse.up();
      await page.waitForTimeout(250);
      await done.click();
      await expect(editor).toBeHidden({ timeout: 30_000 });

      const immediate = annotationArticle.locator('img[alt="Annotated result"], img[alt="Annotated"]').first();
      await expect(immediate).toBeVisible({ timeout: 10_000 });
      await expect(immediate).toHaveAttribute("src", /^data:image\//);
      const immediateOptimisticSrc = await immediate.getAttribute("src");
      expect(immediateOptimisticSrc).not.toBe(sourcePreviewSrc);

      const withShapes = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) =>
          node.id === annotationRecord?.id &&
          node.config && typeof node.config === "object" && !Array.isArray(node.config) &&
          Array.isArray(node.config.parameters?.shapes) && node.config.parameters.shapes.length > 0,
        ),
        "annotation shapes were not persisted to the canonical node config",
        30_000,
      );
      expect(withShapes.nodes.find((node) => node.id === annotationRecord?.id)).toBeTruthy();

      const execution = await waitForCompletedMediaOperation(page, graph.id, annotationRecord.id, 60_000);
      expect(execution.outputAssetIds).toHaveLength(1);
      const outputAssetId = execution.outputAssetIds[0];
      expect(outputAssetId).toBeTruthy();
      expect(outputAssetId).not.toBe(sourceAssetId);
      const [sourceDigest, outputDigest] = await Promise.all([
        mediaAssetDigest(page, sourceAssetId),
        mediaAssetDigest(page, outputAssetId),
      ]);
      expect(outputDigest).not.toBe(sourceDigest);

      const durable = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) => node.id === annotationRecord.id && node.selectedOutputAssetId === outputAssetId),
        "completed annotation output was not selected on the durable node",
        30_000,
      );
      expect(durable.nodes.find((node) => node.id === annotationRecord.id)?.selectedOutputAssetId).toBe(outputAssetId);
      const expectedOutputUrl = `/api/media-assets/${encodeURIComponent(outputAssetId)}/content`;
      await expect(immediate).toHaveAttribute("src", expectedOutputUrl, { timeout: 30_000 });
      const immediateUrl = await immediate.getAttribute("src");

      await addNodeFromToolbar(page, "Output");
      await expect(canvas.locator(".react-flow__node")).toHaveCount(3, { timeout: 10_000 });
      const outputNode = reactFlowNodeForArticle(page, "Output");
      await expect(outputNode).toBeVisible();
      const withOutput = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) => node.kind === "output.single"),
        "output node was not persisted",
        30_000,
      );
      const outputRecord = withOutput.nodes.find((node) => node.kind === "output.single");
      expect(outputRecord).toBeTruthy();
      await dragNodeByArticleBorder(
        page,
        outputNode,
        (viewport?.width ?? 0) < 600 ? { x: 0, y: -280 } : { x: -480, y: 0 },
      );
      if ((viewport?.width ?? 0) < 600) await fitCanvas(page);
      await connectImageHandles(page, annotationNode, outputNode);
      await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.edges.some((edge) =>
          edge.sourceNodeId === annotationRecord.id &&
          edge.targetNodeId === outputRecord?.id &&
          edge.sourcePortId === "image" &&
          edge.targetPortId === "image",
        ),
        "annotation output to downstream output handle connection was not persisted",
        30_000,
      );
      const outputBody = outputNode.locator('[data-node-banana-component="OutputNode"]');
      await expect(outputBody).toBeVisible({ timeout: 30_000 });
      await expect(outputBody.locator("img")).toBeVisible({ timeout: 30_000 });
      const downstream = await page.request.get(
        `/api/generation-graphs/${encodeURIComponent(graph.id)}/nodes/${encodeURIComponent(outputRecord.id)}/outputs`,
      );
      expect(downstream.ok(), `downstream output resolve failed: ${downstream.status()}`).toBeTruthy();
      const downstreamPayload = await downstream.json();
      expect(downstreamPayload.output.groups).toEqual([
        expect.objectContaining({ portId: "image", assets: [expect.objectContaining({ id: outputAssetId })] }),
      ]);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator('[data-node-banana-component="WorkflowCanvas"]')).toBeVisible({ timeout: 15_000 });
      const reloadedAnnotation = nodeArticle(page, "Annotation");
      const reloadedOutput = nodeArticle(page, "Output");
      await expect(reloadedAnnotation.locator('img[alt="Annotated result"], img[alt="Annotated"]')).toBeVisible({ timeout: 30_000 });
      await expect(reloadedOutput.locator("img")).toBeVisible({ timeout: 30_000 });
      const reloadedPreview = reloadedAnnotation.locator('img[alt="Annotated result"], img[alt="Annotated"]');
      await expect(reloadedPreview).toHaveAttribute("src", immediateUrl, { timeout: 30_000 });
      await captureEvidenceScreenshot(page, test.info(), "annotation-reload");
      expect(errors, errors.join("\n")).toEqual([]);
    } finally {
      await deleteWorkflowViaApi(page, graph.id);
    }
  });

  test("Image Resize produces a durable result that Image Compare consumes and restores", async ({ page }) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await waitForFreshWorkflow(page, graph);
      const canvas = page.locator('[data-node-banana-component="WorkflowCanvas"]');
      await addNodeFromToolbar(page, "Image");
      const firstImage = reactFlowNodeForArticle(page, "Image Input");
      await nodeBody(page, "Image Input").locator('input[type="file"]').setInputFiles({
        name: "t25-resize-before.png",
        mimeType: "image/png",
        buffer: deterministicPng(40, 24, 0),
      });
      await expect(nodeBody(page, "Image Input").locator("img")).toBeVisible({ timeout: 30_000 });

      await addNodeFromAllNodes(page, "Image Resize");
      await expect(canvas.locator(".react-flow__node")).toHaveCount(2, { timeout: 15_000 });
      const resizeNode = reactFlowNodeForArticle(page, "Image Resize");
      const narrow = (page.viewportSize()?.width ?? 0) < 600;
      await dragNodeToViewportPosition(page, resizeNode, narrow ? { x: 35, y: 480 } : { x: 900, y: 180 });
      if (narrow) await fitCanvas(page);
      await connectImageHandles(page, firstImage, resizeNode);
      const connected = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.edges.some((edge) => edge.targetPortId === "image" && snapshot.nodes.find((node) => node.id === edge.targetNodeId)?.kind === "edit.image.resize"),
        "Image Resize input was not persisted",
      );
      const resizeRecord = connected.nodes.find((node) => node.kind === "edit.image.resize");
      expect(resizeRecord).toBeTruthy();
      await fitCanvas(page);

      const resizeBody = nodeBody(page, "Image Resize");
      await resizeBody.getByRole("button", { name: "Scale %", exact: true }).click();
      const scale = resizeBody.getByRole("spinbutton").first();
      await scale.fill("50");
      await scale.press("Enter");
      await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) => node.id === resizeRecord.id && node.config?.parameters?.mode === "scale" && node.config?.parameters?.scalePct === 50),
        "Image Resize upstream controls did not persist canonical parameters",
      );
      const resizeButton = resizeBody.getByRole("button", { name: "Resize", exact: true });
      // Simulate a browser-owned execution whose tab vanished before it ran.
      // Reload must expose explicit cancellation, not restart or cancel it itself.
      const beforeOrphan = await readWorkflowViaApi(page, graph.id);
      const orphanResponse = await page.request.post(
        `/api/generation-graphs/${graph.id}/nodes/${resizeRecord.id}/executions`,
        { data: { expectedGraphVersion: beforeOrphan.version } },
      );
      expect(orphanResponse.ok()).toBeTruthy();
      const orphan = (await orphanResponse.json()).execution;
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(resizeBody).toBeVisible({ timeout: 15_000 });
      await fitCanvas(page);
      await resizeBody.click({ position: { x: 12, y: 12 } });
      const cancel = page.locator(`[data-node-banana-component="FloatingNodeHeader"][data-node-id="${resizeRecord.id}"]`)
        .getByRole("button", { name: "Cancel operation" });
      await expect(cancel).toBeEnabled();
      await cancel.focus();
      await cancel.press("Enter");
      await expect.poll(async () => {
        const response = await page.request.get(`/api/generation-graphs/${graph.id}/nodes/${resizeRecord.id}/executions`);
        return (await response.json()).executions.find((item) => item.executionId === orphan.executionId)?.status;
      }).toBe("cancelled");
      await expect(resizeButton).toBeEnabled({ timeout: 30_000 });
      const resized = await runBrowserMediaOperation(page, graph.id, resizeRecord.id, resizeButton);
      expect(resized.plan).toMatchObject({ kind: "edit.image.resize", outputPortId: "image", expectedOutputCount: 1 });
      expect(resized.outputAssetIds).toHaveLength(1);
      const resizedAssetId = resized.outputAssetIds[0];
      await expect(resizeBody.locator("img")).toBeVisible({ timeout: 30_000 });
      await expect(resizeButton).toBeEnabled();
      await expect(resizeBody.locator("img")).toHaveAttribute("src", new RegExp(resizedAssetId));

      await addNodeFromToolbar(page, "Image");
      await expect(canvas.locator(".react-flow__node")).toHaveCount(3, { timeout: 15_000 });
      const imageBodies = canvas.locator('[data-node-banana-component="ImageInputNode"]');
      const secondImageBody = imageBodies.nth(1);
      const secondImage = secondImageBody.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' react-flow__node ')][1]");
      await secondImageBody.locator('input[type="file"]').setInputFiles({
        name: "t25-resize-after.png",
        mimeType: "image/png",
        buffer: deterministicPng(40, 24, 1),
      });
      await expect(secondImageBody.locator("img")).toBeVisible({ timeout: 30_000 });
      await dragNodeToViewportPosition(page, secondImage, narrow ? { x: 35, y: 850 } : { x: 100, y: 520 });

      await addNodeFromAllNodes(page, "Image Compare");
      await expect(canvas.locator(".react-flow__node")).toHaveCount(4, { timeout: 15_000 });
      const compareNode = reactFlowNodeForArticle(page, "Image Compare");
      await dragNodeToViewportPosition(page, compareNode, narrow ? { x: 35, y: 1_200 } : { x: 920, y: 520 });
      await fitCanvas(page);
      const beforeTarget = compareNode.locator('.react-flow__handle.target[data-handletype="image"]').nth(0);
      const afterTarget = compareNode.locator('.react-flow__handle.target[data-handletype="image"]').nth(1);
      await connectHandleLocators(page, firstImage.locator('.react-flow__handle.source[data-handletype="image"]').first(), beforeTarget);
      await connectHandleLocators(page, resizeNode.locator('.react-flow__handle.source[data-handletype="image"]').first(), afterTarget);
      const compared = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => {
          const compare = snapshot.nodes.find((node) => node.kind === "inspect.imageCompare");
          return Boolean(compare) && snapshot.edges.filter((edge) => edge.targetNodeId === compare.id).length === 2;
        },
        "Image Compare A/B connections were not persisted",
      );
      const compareRecord = compared.nodes.find((node) => node.kind === "inspect.imageCompare");
      expect(compareRecord).toBeTruthy();
      await expect(nodeBody(page, "Image Compare").locator("img")).toHaveCount(2, { timeout: 30_000 });

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(nodeBody(page, "Image Resize").locator("img")).toBeVisible({ timeout: 30_000 });
      await expect(nodeBody(page, "Image Compare").locator("img")).toHaveCount(2, { timeout: 30_000 });
      const restored = await readWorkflowViaApi(page, graph.id);
      expect(restored.nodes.find((node) => node.id === resizeRecord.id)?.selectedOutputAssetId).toBe(resizedAssetId);
      await captureEvidenceScreenshot(page, test.info(), "image-resize-compare-reload");
      expect(errors, errors.join("\n")).toEqual([]);
    } finally {
      await deleteWorkflowViaApi(page, graph.id);
    }
  });

  test("Audio Input feeds durable Output and Gallery audio across reload without Audio Edit", async ({ page }) => {
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await waitForFreshWorkflow(page, graph);
      const canvas = page.locator('[data-node-banana-component="WorkflowCanvas"]');
      const narrow = (page.viewportSize()?.width ?? 0) < 600;

      await addNodeFromAllNodes(page, "Audio Input");
      const audioInput = reactFlowNodeForArticle(page, "Audio Input");
      const audioInputBody = nodeBody(page, "Audio Input");
      await audioInputBody.locator('input[type="file"]').setInputFiles({
        name: "t25-tone.wav",
        mimeType: "audio/wav",
        buffer: deterministicWav(),
      });
      await expect(audioInputBody.getByRole("button", { name: "Download audio" })).toBeAttached({ timeout: 30_000 });
      const uploaded = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) => node.kind === "input.audio" && typeof node.config?.assetId === "string"),
        "Audio Input did not persist the uploaded asset",
      );
      const audioInputRecord = uploaded.nodes.find((node) => node.kind === "input.audio");
      expect(audioInputRecord).toBeTruthy();
      await dragNodeToViewportPosition(page, audioInput, narrow ? { x: 20, y: 40 } : { x: 120, y: 120 });

      const uploadedAssetId = audioInputRecord.config.assetId;

      await addNodeFromToolbar(page, "Output");
      await expect(canvas.locator(".react-flow__node")).toHaveCount(2, { timeout: 15_000 });
      const output = reactFlowNodeForArticle(page, "Output");
      await dragNodeToViewportPosition(page, output, narrow ? { x: 35, y: 700 } : { x: 1_000, y: 600 });

      await addNodeFromAllNodes(page, "Output Gallery");
      await expect(canvas.locator(".react-flow__node")).toHaveCount(3, { timeout: 15_000 });
      const gallery = reactFlowNodeForArticle(page, "Output Gallery");
      await dragNodeToViewportPosition(page, gallery, narrow ? { x: 35, y: 780 } : { x: 500, y: 760 });
      await fitCanvas(page);
      await connectHandles(page, audioInput, output, "audio", "audio");
      await connectHandles(page, audioInput, gallery, "audio", "audio");

      const downstream = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => {
          const outputRecord = snapshot.nodes.find((node) => node.kind === "output.single");
          const galleryRecord = snapshot.nodes.find((node) => node.kind === "output.gallery");
          return Boolean(outputRecord && galleryRecord) && snapshot.edges.some((edge) => edge.targetNodeId === outputRecord.id && edge.targetPortId === "audio") && snapshot.edges.some((edge) => edge.targetNodeId === galleryRecord.id && edge.targetPortId === "audio");
        },
        "Audio Input downstream Output/Gallery connections were not persisted",
      );
      const outputRecord = downstream.nodes.find((node) => node.kind === "output.single");
      const galleryRecord = downstream.nodes.find((node) => node.kind === "output.gallery");
      expect(outputRecord).toBeTruthy();
      expect(galleryRecord).toBeTruthy();
      await expect(nodeBody(page, "Output").locator("audio")).toBeAttached({ timeout: 30_000 });
      await expect(nodeBody(page, "Output Gallery").getByRole("button", { name: "Open audio 1" })).toBeVisible({ timeout: 30_000 });
      for (const record of [outputRecord, galleryRecord]) {
        const response = await page.request.get(`/api/generation-graphs/${encodeURIComponent(graph.id)}/nodes/${encodeURIComponent(record.id)}/outputs`);
        expect(response.ok()).toBeTruthy();
        expect((await response.json()).output.groups).toEqual([
          expect.objectContaining({ portId: "audio", assets: [expect.objectContaining({ id: uploadedAssetId })] }),
        ]);
      }

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(nodeBody(page, "Audio Input").getByRole("button", { name: "Download audio" })).toBeAttached({ timeout: 30_000 });
      await expect(nodeBody(page, "Output").locator("audio")).toBeAttached({ timeout: 30_000 });
      await expect(nodeBody(page, "Output Gallery").getByRole("button", { name: "Open audio 1" })).toBeVisible({ timeout: 30_000 });
      await captureEvidenceScreenshot(page, test.info(), "audio-input-output-gallery-reload");
      expect(errors, errors.join("\n")).toEqual([]);
    } finally {
      await deleteWorkflowViaApi(page, graph.id);
    }
  });

  test("Split Grid ordered outputs feed the GIF start plan and persist every gallery item", async ({ page }) => {
    test.setTimeout(240_000);
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    try {
      await waitForFreshWorkflow(page, graph);
      const canvas = page.locator('[data-node-banana-component="WorkflowCanvas"]');

      await addNodeFromToolbar(page, "Image");
      const imageNode = reactFlowNodeForArticle(page, "Image Input");
      const imageBody = nodeBody(page, "Image Input");
      await expect(imageBody.locator('input[type="file"]')).toBeAttached();
      await imageBody.locator('input[type="file"]').setInputFiles({
        name: "스크린샷 node-banana split source.png",
        mimeType: "image/png",
        buffer: deterministicPng(),
      });
      await expect(imageBody.locator("img")).toBeVisible({ timeout: 30_000 });

      await addNodeFromAllNodes(page, "Split Grid");
      await expect(canvas.locator(".react-flow__node")).toHaveCount(2, { timeout: 15_000 });
      const splitNode = reactFlowNodeForArticle(page, "Split Grid");
      await expect(splitNode).toBeVisible();

      const viewport = page.viewportSize();
      const narrow = (viewport?.width ?? 0) < 600;
      await dragNodeByArticleBorder(page, splitNode, narrow ? { x: 0, y: 150 } : { x: 340, y: 0 });
      if (narrow) await fitCanvas(page);
      await connectImageHandles(page, imageNode, splitNode);

      const connected = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => {
          const kinds = new Set(snapshot.nodes.map((node) => node.kind));
          return kinds.has("input.image") && kinds.has("edit.image.splitGrid") && snapshot.edges.length === 1;
        },
        "split-grid source connection was not persisted",
        30_000,
      );
      const inputRecord = connected.nodes.find((node) => node.kind === "input.image");
      const splitRecord = connected.nodes.find((node) => node.kind === "edit.image.splitGrid");
      expect(inputRecord).toBeTruthy();
      expect(splitRecord).toBeTruthy();
      const sourceAssetId = inputRecord.config && typeof inputRecord.config === "object" && !Array.isArray(inputRecord.config)
        ? typeof inputRecord.config.assetId === "string" ? inputRecord.config.assetId : null
        : null;
      expect(sourceAssetId).toBeTruthy();

      const splitBody = nodeBody(page, "Split Grid");
      await splitBody.getByRole("textbox", { name: "Rows" }).fill("1");
      await splitBody.getByRole("textbox", { name: "Rows" }).press("Enter");
      await splitBody.getByRole("textbox", { name: "Columns" }).fill("3");
      await splitBody.getByRole("textbox", { name: "Columns" }).press("Enter");
      await splitBody.getByRole("textbox", { name: "Columns" }).fill("2");
      await splitBody.getByRole("textbox", { name: "Columns" }).press("Enter");
      await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) =>
          node.id === splitRecord.id &&
          node.config?.parameters?.rows === 1 &&
          node.config?.parameters?.cols === 2,
        ),
        "Split Grid controls did not persist their canonical rows/cols values",
        30_000,
      );

      const splitButton = splitBody.getByRole("button", { name: "Split 1×2", exact: true });
      await expect(splitButton).toBeEnabled({ timeout: 30_000 });
      const splitCompleted = await runBrowserMediaOperation(page, graph.id, splitRecord.id, splitButton, 125_000);
      expect(splitCompleted.plan).toMatchObject({ kind: "edit.image.splitGrid", outputPortId: "images", expectedOutputCount: 2 });
      expect(splitCompleted.plan.inputs).toEqual([expect.objectContaining({ assetId: sourceAssetId, sortOrder: 0 })]);
      expect(splitCompleted.outputAssetIds).toHaveLength(2);
      const [cell0Id, cell1Id] = splitCompleted.outputAssetIds;
      expect(cell0Id).not.toBe(cell1Id);
      await expect(splitBody.getByText("2 cell groups", { exact: true })).toBeVisible();
      const afterSplit = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) => node.id === splitRecord.id && node.selectedOutputAssetId === cell0Id && node.config?.materialization?.cells?.length === 2),
        "split-grid did not select its first durable output",
        30_000,
      );
      expect(afterSplit.nodes.find((node) => node.id === splitRecord.id)?.selectedOutputAssetId).toBe(cell0Id);
      const cells = afterSplit.nodes.find((node) => node.id === splitRecord.id).config.materialization.cells;
      expect(cells.map((cell) => afterSplit.nodes.find((node) => node.id === cell.baseNodeId)?.config?.assetId)).toEqual([cell0Id, cell1Id]);
      // Copy the real persisted Split result, not just an empty graph fixture.
      const copyResponse = await page.request.post(`/api/generation-graphs/${graph.id}/copy`);
      expect(copyResponse.status()).toBe(201);
      const copiedSpace = (await copyResponse.json()).graph;
      try {
        const copiedSplit = copiedSpace.nodes.find((node) => node.kind === "edit.image.splitGrid");
        expect(copiedSplit.id).not.toBe(splitRecord.id);
        expect(copiedSplit.selectedOutputAssetId).toBe(cell0Id);
        const copiedCells = copiedSplit.config.materialization.cells;
        expect(copiedCells.map((cell) => copiedSpace.nodes.find((node) => node.id === cell.baseNodeId)?.config.assetId)).toEqual([cell0Id, cell1Id]);
        expect(copiedCells.every((cell) => !cells.some((source) => source.groupId === cell.groupId))).toBe(true);
        const copiedGallery = { id: "copied_split_gallery", kind: "output.gallery", position: { x: 1800, y: 0 }, configVersion: 1, config: { mediaType: "image" }, selectedOutputAssetId: null };
        const update = await page.request.put(`/api/generation-graphs/${copiedSpace.id}`, { data: {
          schemaVersion: 3, groups: copiedSpace.groups, expectedVersion: copiedSpace.version, title: "Independent copied Space",
          nodes: [...copiedSpace.nodes, copiedGallery], edges: [...copiedSpace.edges, {
            id: "copied_split_gallery_edge", sourceNodeId: copiedSplit.id, sourcePortId: "images",
            targetNodeId: copiedGallery.id, targetPortId: "image", sortOrder: 0,
          }],
        } });
        expect(update.ok(), await update.text()).toBeTruthy();
        const result = await page.request.get(`/api/generation-graphs/${copiedSpace.id}/nodes/${copiedGallery.id}/outputs`);
        expect(result.ok(), await result.text()).toBeTruthy();
        expect((await result.json()).output.groups.flatMap((group) => group.assets.map((asset) => asset.id))).toEqual([cell0Id, cell1Id]);
        expect((await (await page.request.get(`/api/generation-graphs/${copiedSpace.id}`)).json()).graph.title).toBe("Independent copied Space");
        expect((await (await page.request.get(`/api/generation-graphs/${graph.id}`)).json()).graph.nodes).toEqual(afterSplit.nodes);
      } finally { await deleteWorkflowViaApi(page, copiedSpace.id); }
      expect(await mediaAssetDigest(page, cell0Id)).toHaveLength(64);
      expect(await mediaAssetDigest(page, cell1Id)).toHaveLength(64);
      await expect(canvas.locator(".react-flow__edge-reference")).toHaveCount(2);
      await expect(page.getByText("Cell 1-1", { exact: true })).toBeAttached();
      await expect(page.getByText("Cell 1-2", { exact: true })).toBeAttached();
      // A cell output must resolve its own slice, not the Split collection's first item.
      const output = { id: "split_cell_output", kind: "output.single", position: { x: 1800, y: 0 }, configVersion: 1, config: { mediaType: "image" }, selectedOutputAssetId: null };
      const tempEdge = { id: "split_cell_output_edge", sourceNodeId: cells[1].baseNodeId, sourcePortId: "image", targetNodeId: output.id, targetPortId: "image", sortOrder: 0 };
      await replaceWorkflowViaApi(page, graph.id, [...afterSplit.nodes, output], [...afterSplit.edges, tempEdge]);
      const singleResponse = await page.request.get(`/api/generation-graphs/${graph.id}/nodes/${output.id}/outputs`);
      expect(singleResponse.ok()).toBeTruthy();
      const singlePayload = await singleResponse.json();
      expect(singlePayload.output.groups.flatMap((group) => group.assets.map((asset) => asset.id))).toEqual([cell1Id]);
      await replaceWorkflowViaApi(page, graph.id, afterSplit.nodes, afterSplit.edges);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(canvas.locator(".react-flow__node")).toHaveCount(4, { timeout: 30_000 });
      await expect(canvas.locator(".react-flow__edge-reference")).toHaveCount(2);

      // Add downstream consumers only after the source operation has completed. This
      // keeps the actual Split control unobstructed at every supported viewport and
      // proves that late-bound downstream nodes resolve the durable ordered outputs.
      await addNodeFromAllNodes(page, "GIF Encoder");
      await expect(canvas.locator(".react-flow__node")).toHaveCount(5, { timeout: 15_000 });
      const gifNode = reactFlowNodeForArticle(page, "GIF Encoder");
      await expect(gifNode).toBeVisible();
      // Split now materializes cell nodes to its right. A horizontal-only move
      // puts the GIF frame handle underneath a cell's floating header. Place
      // the consumer below the actual occupied bounds before connecting it.
      const gifBox = await gifNode.boundingBox();
      expect(gifBox).toBeTruthy();
      const occupiedBottom = await canvas.locator(".react-flow__node").evaluateAll((nodes, gifId) =>
        Math.max(...nodes.filter((node) => node.getAttribute("data-id") !== gifId)
          .map((node) => node.getBoundingClientRect().bottom)),
        await gifNode.getAttribute("data-id"),
      );
      await dragNodeByArticleBorder(page, gifNode, narrow
        ? { x: 0, y: 300 }
        : { x: 680, y: Math.max(0, occupiedBottom + 80 - gifBox.y) });

      await addNodeFromAllNodes(page, "Output Gallery");
      await expect(canvas.locator(".react-flow__node")).toHaveCount(6, { timeout: 15_000 });
      const galleryNode = reactFlowNodeForArticle(page, "Output Gallery");
      await expect(galleryNode).toBeVisible();
      await dragNodeByArticleBorder(page, galleryNode, narrow ? { x: 0, y: 470 } : { x: 680, y: 360 });
      await page.getByRole("button", { name: "Fit View", exact: true }).click();
      await page.waitForTimeout(500);
      await connectHandles(page, splitNode, gifNode, "reference", "image");
      await connectHandles(page, splitNode, galleryNode, "reference", "image");

      const downstreamConnected = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => {
          const kinds = new Set(snapshot.nodes.map((node) => node.kind));
          return kinds.has("edit.image.gif") && kinds.has("output.gallery") && snapshot.edges.length === 5;
        },
        "split-grid ordered-list handles were not persisted",
        30_000,
      );
      const gifRecord = downstreamConnected.nodes.find((node) => node.kind === "edit.image.gif");
      const galleryRecord = downstreamConnected.nodes.find((node) => node.kind === "output.gallery");
      expect(gifRecord).toBeTruthy();
      expect(galleryRecord).toBeTruthy();

      const galleryResponse = await page.request.get(
        `/api/generation-graphs/${encodeURIComponent(graph.id)}/nodes/${encodeURIComponent(galleryRecord.id)}/outputs`,
      );
      expect(galleryResponse.ok(), `gallery output resolve failed: ${galleryResponse.status()}`).toBeTruthy();
      const galleryPayload = await galleryResponse.json();
      expect(galleryPayload.output.groups).toEqual([
        expect.objectContaining({ portId: "image", assets: [expect.objectContaining({ id: cell0Id }), expect.objectContaining({ id: cell1Id })] }),
      ]);

      const gifBody = nodeBody(page, "GIF Encoder");
      await connectHandleLocators(page,
        imageNode.locator('.react-flow__handle.source[data-handletype="image"]').first(),
        gifNode.locator('.react-flow__handle.target[data-handleid="image-1"]'),
      );
      const mixed = await waitForWorkflowState(page, graph.id, (snapshot) =>
        snapshot.edges.length === 6 && snapshot.nodes.find((node) => node.id === gifRecord.id)?.config?.parameters?.clipOrder?.length === 2,
      "mixed GIF source groups were not persisted", 30_000);
      const splitGifEdge = mixed.edges.find((edge) => edge.sourceNodeId === splitRecord.id && edge.targetNodeId === gifRecord.id);
      const singleGifEdge = mixed.edges.find((edge) => edge.sourceNodeId === inputRecord.id && edge.targetNodeId === gifRecord.id);
      expect(splitGifEdge).toBeTruthy();
      expect(singleGifEdge).toBeTruthy();
      const splitFrames = gifBody.locator(`[data-source-edge-id="${splitGifEdge.id}"]`);
      const singleFrame = gifBody.locator(`[data-source-edge-id="${singleGifEdge.id}"]`);
      await expect(splitFrames).toHaveCount(2);
      await expect(singleFrame).toHaveCount(1);
      const fromFrame = await singleFrame.boundingBox();
      const toFrame = await splitFrames.first().boundingBox();
      expect(fromFrame).toBeTruthy();
      expect(toFrame).toBeTruthy();
      await page.mouse.move(fromFrame.x + fromFrame.width / 2, fromFrame.y + fromFrame.height / 2);
      await page.mouse.down();
      await page.mouse.move(toFrame.x + toFrame.width / 2, toFrame.y + toFrame.height / 2, { steps: 12 });
      await page.waitForTimeout(100);
      await page.mouse.up();
      await waitForWorkflowState(page, graph.id, (snapshot) =>
        JSON.stringify(snapshot.nodes.find((node) => node.id === gifRecord.id)?.config?.parameters?.clipOrder) === JSON.stringify([singleGifEdge.id, splitGifEdge.id]),
      "GIF group drag did not persist edge order", 30_000);
      await expect(gifBody.locator("[data-source-edge-id]").first()).toHaveAttribute("data-source-edge-id", singleGifEdge.id);
      const encodeGif = gifBody.getByRole("button", { name: "Encode GIF", exact: true });
      await expect(encodeGif).toBeEnabled({ timeout: 30_000 });
      const gifCompleted = await runBrowserMediaOperation(page, graph.id, gifRecord.id, encodeGif, 60_000);
      expect(gifCompleted.plan).toMatchObject({ kind: "edit.image.gif", expectedOutputCount: 1 });
      expect(gifCompleted.plan.inputs.map((input) => input.assetId)).toEqual([sourceAssetId, cell0Id, cell1Id]);
      expect(gifCompleted.plan.inputs.map((input) => input.sortOrder)).toEqual([0, 1, 2]);
      expect(gifCompleted.outputAssetIds).toHaveLength(1);
      const gifAssetResponse = await page.request.get(
        `/api/media-assets/${encodeURIComponent(gifCompleted.outputAssetIds[0])}/content`,
      );
      expect(gifAssetResponse.ok()).toBeTruthy();
      expect((await gifAssetResponse.body()).subarray(0, 6).toString("ascii")).toMatch(/^GIF8[79]a$/);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator('[data-node-banana-component="WorkflowCanvas"]')).toBeVisible({ timeout: 15_000 });
      const reloadedGallery = reactFlowNodeForArticle(page, "Output Gallery");
      await expect(nodeBody(page, "Split Grid").getByText("2 cell groups", { exact: true })).toBeVisible();
      await expect(reloadedGallery).toBeVisible();
      await expect(reloadedGallery.locator('img')).toHaveCount(2, { timeout: 30_000 });
      const reloadedGalleryResponse = await page.request.get(
        `/api/generation-graphs/${encodeURIComponent(graph.id)}/nodes/${encodeURIComponent(galleryRecord.id)}/outputs`,
      );
      expect(reloadedGalleryResponse.ok(), `reloaded gallery output resolve failed: ${reloadedGalleryResponse.status()}`).toBeTruthy();
      const reloadedGalleryPayload = await reloadedGalleryResponse.json();
      expect(reloadedGalleryPayload.output.groups).toEqual([
        expect.objectContaining({
          portId: "image",
          assets: [expect.objectContaining({ id: cell0Id }), expect.objectContaining({ id: cell1Id })],
        }),
      ]);
      await captureEvidenceScreenshot(page, test.info(), "split-grid-gallery-reload");
      await expect(singleFrame).toHaveCount(1);
      await expect(splitFrames).toHaveCount(2);
      await expect(gifBody.locator("[data-source-edge-id]").first()).toHaveAttribute("data-source-edge-id", singleGifEdge.id);
      await singleFrame.hover();
      await singleFrame.getByRole("button", { name: "Disconnect", exact: true }).click();
      await waitForWorkflowState(page, graph.id, (snapshot) =>
        !snapshot.edges.some((edge) => edge.id === singleGifEdge.id) && snapshot.edges.some((edge) => edge.id === splitGifEdge.id),
      "GIF Disconnect removed the wrong source group", 30_000);
      await expect(singleFrame).toHaveCount(0);
      await expect(splitFrames).toHaveCount(2);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(splitFrames).toHaveCount(2, { timeout: 30_000 });
      await expect(singleFrame).toHaveCount(0);
      await captureEvidenceScreenshot(page, test.info(), "gif-mixed-source-disconnect-reload");
      expect(errors, errors.join("\n")).toEqual([]);
    } finally {
      await deleteWorkflowViaApi(page, graph.id);
    }
  });

  test("vendored video input runs frame grab, trim, stitch, and ease curve into durable outputs", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const errors = attachErrorCapture(page);
    const graph = await createWorkflowViaApi(page);
    const sampleVideoPath = path.resolve("public/sample-video.mp4");
    try {
      await waitForFreshWorkflow(page, graph);
      const canvas = page.locator('[data-node-banana-component="WorkflowCanvas"]');
      const narrow = (page.viewportSize()?.width ?? 0) < 600;
      const videoInputBody = (index) => canvas.locator('[data-node-banana-component="VideoInputNode"]').nth(index);
      const videoInputNode = (index) => videoInputBody(index).locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' react-flow__node ')][1]");

      // Add and upload through the real vendored VideoInputNode presenter. Two
      // distinct nodes make the ordered Video Stitch input contract observable.
      await addNodeFromAllNodes(page, "Video Input");
      await expect(videoInputBody(0)).toBeVisible();
      await dragNodeToViewportPosition(page, videoInputNode(0), narrow ? { x: 24, y: 48 } : { x: 24, y: 48 });
      await videoInputBody(0).locator('input[type="file"]').setInputFiles(sampleVideoPath);
      await expect(videoInputBody(0).locator("video")).toBeVisible({ timeout: 30_000 });
      const firstUpload = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) =>
          node.kind === "input.video" &&
          typeof node.config?.assetId === "string" &&
          node.config.assetId.length > 0,
        ),
        "first Video Input upload did not persist its canonical assetId",
        30_000,
      );
      const firstInputRecord = firstUpload.nodes.find((node) =>
        node.kind === "input.video" && typeof node.config?.assetId === "string" && node.config.assetId.length > 0,
      );
      expect(firstInputRecord).toBeTruthy();
      const firstInputAssetId = firstInputRecord?.config?.assetId;
      expect(firstInputAssetId).toEqual(expect.any(String));

      await addNodeFromAllNodes(page, "Video Input");
      await expect(videoInputBody(1)).toBeVisible();
      await dragNodeToViewportPosition(page, videoInputNode(1), narrow ? { x: 24, y: 420 } : { x: 24, y: 500 });
      await videoInputBody(1).locator('input[type="file"]').setInputFiles(sampleVideoPath);
      await expect(videoInputBody(1).locator("video")).toBeVisible({ timeout: 30_000 });
      const bothUploaded = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.filter((node) =>
          node.kind === "input.video" &&
          typeof node.config?.assetId === "string" &&
          node.config.assetId.length > 0,
        ).length === 2,
        "both Video Input uploads did not persist canonical assetIds",
        30_000,
      );
      const secondInputRecord = bothUploaded.nodes.find((node) =>
        node.kind === "input.video" && node.id !== firstInputRecord?.id &&
        typeof node.config?.assetId === "string" && node.config.assetId.length > 0,
      );
      expect(secondInputRecord).toBeTruthy();
      const secondInputAssetId = secondInputRecord?.config?.assetId;
      expect(secondInputAssetId).toEqual(expect.any(String));
      expect(secondInputAssetId).not.toBe(firstInputAssetId);

      const addAndPlace = async (label, position) => {
        await addNodeFromAllNodes(page, label);
        const body = nodeBody(page, label);
        const node = reactFlowNodeForArticle(page, label);
        await expect(body).toBeVisible();
        await dragNodeToViewportPosition(page, node, position);
        return { body, node };
      };
      const trim = await addAndPlace("Video Trim", narrow ? { x: 24, y: 790 } : { x: 400, y: 48 });
      const frame = await addAndPlace("Frame Grab", narrow ? { x: 24, y: 1_150 } : { x: 790, y: 48 });
      const ease = await addAndPlace("Ease Curve", narrow ? { x: 24, y: 1_520 } : { x: 400, y: 500 });
      const stitch = await addAndPlace("Video Stitch", narrow ? { x: 24, y: 1_900 } : { x: 790, y: 500 });
      const output = await addAndPlace("Output", narrow ? { x: 24, y: 2_280 } : { x: 1_330, y: 48 });
      const gallery = await addAndPlace("Output Gallery", narrow ? { x: 24, y: 2_650 } : { x: 1_330, y: 500 });
      await expect(canvas.locator(".react-flow__node")).toHaveCount(8, { timeout: 15_000 });
      await expect(canvas.locator('[data-node-banana-component="VideoInputNode"]')).toHaveCount(2);
      await expect(canvas.locator('[data-node-banana-component="VideoTrimNode"]')).toHaveCount(1);
      await expect(canvas.locator('[data-node-banana-component="VideoFrameGrabNode"]')).toHaveCount(1);
      await expect(canvas.locator('[data-node-banana-component="EaseCurveNode"]')).toHaveCount(1);
      await expect(canvas.locator('[data-node-banana-component="VideoStitchNode"]')).toHaveCount(1);
      await expect(canvas.locator('[data-node-banana-component="OutputNode"]')).toHaveCount(1);
      await expect(canvas.locator('[data-node-banana-component="OutputGalleryNode"]')).toHaveCount(1);

      // Fit after all additions so connectors remain usable regardless of the
      // toolbar/minimap footprint or the mobile canvas geometry.
      await fitCanvas(page);
      const firstVideoSource = videoInputNode(0).locator('.react-flow__handle.source[data-handletype="video"]').first();
      const secondVideoSource = videoInputNode(1).locator('.react-flow__handle.source[data-handletype="video"]').first();
      await connectHandles(page, videoInputNode(0), trim.node, "video", "video");
      await connectHandles(page, videoInputNode(0), frame.node, "video", "video");
      await connectHandles(page, videoInputNode(0), ease.node, "video", "video");
      const stitchVideoTargets = stitch.node.locator('.react-flow__handle.target[data-handletype="video"]');
      await expect(stitchVideoTargets).toHaveCount(2);
      await connectHandleLocators(page, firstVideoSource, stitchVideoTargets.nth(0));
      await connectHandleLocators(page, secondVideoSource, stitchVideoTargets.nth(1));
      await connectHandles(page, frame.node, output.node, "image", "image");
      const galleryVideoTarget = gallery.node.locator('.react-flow__handle.target[data-handletype="video"]').first();
      await connectHandles(page, trim.node, gallery.node, "video", "video");
      await connectHandleLocators(page, stitch.node.locator('.react-flow__handle.source[data-handletype="video"]').first(), galleryVideoTarget);
      await connectHandleLocators(page, ease.node.locator('.react-flow__handle.source[data-handletype="video"]').first(), galleryVideoTarget);

      const connected = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => {
          const inputIds = new Set(snapshot.nodes.filter((node) => node.kind === "input.video").map((node) => node.id));
          const trimId = snapshot.nodes.find((node) => node.kind === "edit.video.trim")?.id;
          const frameId = snapshot.nodes.find((node) => node.kind === "edit.video.frameGrab")?.id;
          const easeId = snapshot.nodes.find((node) => node.kind === "edit.video.easeCurve")?.id;
          const stitchId = snapshot.nodes.find((node) => node.kind === "edit.video.stitch")?.id;
          const outputId = snapshot.nodes.find((node) => node.kind === "output.single")?.id;
          const galleryId = snapshot.nodes.find((node) => node.kind === "output.gallery")?.id;
          return snapshot.edges.length === 9 &&
            snapshot.edges.some((edge) => inputIds.has(edge.sourceNodeId) && edge.targetNodeId === trimId && edge.targetPortId === "video") &&
            snapshot.edges.some((edge) => inputIds.has(edge.sourceNodeId) && edge.targetNodeId === frameId && edge.targetPortId === "video") &&
            snapshot.edges.some((edge) => inputIds.has(edge.sourceNodeId) && edge.targetNodeId === easeId && edge.targetPortId === "video") &&
            snapshot.edges.filter((edge) => inputIds.has(edge.sourceNodeId) && edge.targetNodeId === stitchId && edge.targetPortId === "clips").length === 2 &&
            snapshot.edges.some((edge) => edge.sourceNodeId === frameId && edge.targetNodeId === outputId && edge.targetPortId === "image") &&
            snapshot.edges.filter((edge) => [trimId, stitchId, easeId].includes(edge.sourceNodeId) && edge.targetNodeId === galleryId && edge.targetPortId === "video").length === 3;
        },
        "video operation graph connections were not persisted",
        45_000,
      );
      const trimRecord = connected.nodes.find((node) => node.kind === "edit.video.trim");
      const frameRecord = connected.nodes.find((node) => node.kind === "edit.video.frameGrab");
      const easeRecord = connected.nodes.find((node) => node.kind === "edit.video.easeCurve");
      const stitchRecord = connected.nodes.find((node) => node.kind === "edit.video.stitch");
      const outputRecord = connected.nodes.find((node) => node.kind === "output.single");
      const galleryRecord = connected.nodes.find((node) => node.kind === "output.gallery");
      for (const record of [trimRecord, frameRecord, easeRecord, stitchRecord, outputRecord, galleryRecord]) expect(record).toBeTruthy();

      const stitchEdges = connected.edges.filter((edge) => edge.targetNodeId === stitchRecord.id && edge.targetPortId === "clips")
        .sort((left, right) => left.sortOrder - right.sortOrder);
      await waitForWorkflowState(page, graph.id, (snapshot) =>
        snapshot.nodes.find((node) => node.id === stitchRecord.id)?.config?.parameters?.clipOrder?.length === 2,
      "Stitch filmstrip order was not initialized");
      const firstClip = stitch.body.locator(`[data-clip-id="${stitchEdges[0].id}"]`);
      const secondClip = stitch.body.locator(`[data-clip-id="${stitchEdges[1].id}"]`);
      for (const clip of [firstClip, secondClip]) {
        await expect(clip.locator("img")).toBeVisible({ timeout: 30_000 });
        await expect.poll(() => clip.locator("img").evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
        await expect(clip.locator("img")).toHaveAttribute("draggable", "false");
      }
      const from = await secondClip.boundingBox();
      const to = await firstClip.boundingBox();
      if (!from || !to) throw new Error("Stitch reorder filmstrip has no hit area");
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
      await page.waitForTimeout(100);
      await page.mouse.up();
      await waitForWorkflowState(page, graph.id, (snapshot) =>
        JSON.stringify(snapshot.nodes.find((node) => node.id === stitchRecord.id)?.config?.parameters?.clipOrder)
          === JSON.stringify([stitchEdges[1].id, stitchEdges[0].id]),
      "Stitch pointer reorder was not persisted");

      // sample-video.mp4 is one second long; set the upstream dual-range end
      // thumb below that duration so the server-side browser-operation plan is
      // valid while still exercising the actual vendored Trim control.
      const trimRanges = trim.body.locator('input[type="range"]');
      await expect(trimRanges).toHaveCount(2);
      await trimRanges.nth(1).fill("0.8");
      await trimRanges.nth(1).press("Enter").catch(() => undefined);
      await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) => node.id === trimRecord?.id && node.config?.parameters?.endMs === 800),
        "Video Trim end range did not persist canonical endMs",
        30_000,
      );

      const trimButton = trim.body.getByRole("button", { name: "Trim", exact: true });
      await expect(trimButton).toBeEnabled({ timeout: 30_000 });
      const trimmed = await runBrowserMediaOperation(page, graph.id, trimRecord.id, trimButton, 60_000);
      expect(trimmed.plan).toMatchObject({ kind: "edit.video.trim", outputPortId: "video", outputMediaType: "video", expectedOutputCount: 1 });
      expect(trimmed.plan.inputs.map((input) => input.assetId)).toEqual([firstInputAssetId]);
      expect(trimmed.outputAssetIds).toHaveLength(1);
      const trimmedAssetId = trimmed.outputAssetIds[0];
      expect(trimmedAssetId).toEqual(expect.any(String));
      await expect(trim.body.locator("video")).toBeVisible({ timeout: 30_000 });
      const trimProbe = await expectPlayableVideo(trim.body.locator("video"), trimmedAssetId);
      expect(trimProbe.duration).toBeCloseTo(0.8, 1);
      expect(trimProbe).toMatchObject({ width: 640, height: 360 });
      const trimDurable = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) => node.id === trimRecord.id && node.selectedOutputAssetId === trimmedAssetId),
        "completed Video Trim output was not selected durably",
        30_000,
      );
      expect(trimDurable.nodes.find((node) => node.id === trimRecord.id)?.selectedOutputAssetId).toBe(trimmedAssetId);

      const frameButton = frame.body.getByRole("button", { name: "Extract Frame", exact: true });
      await expect(frameButton).toBeEnabled({ timeout: 30_000 });
      const framed = await runBrowserMediaOperation(page, graph.id, frameRecord.id, frameButton, 60_000);
      expect(framed.plan).toMatchObject({ kind: "edit.video.frameGrab", outputPortId: "image", outputMediaType: "image", expectedOutputCount: 1 });
      expect(framed.plan.inputs.map((input) => input.assetId)).toEqual([firstInputAssetId]);
      expect(framed.outputAssetIds).toHaveLength(1);
      const frameAssetId = framed.outputAssetIds[0];
      expect(frameAssetId).toEqual(expect.any(String));
      const frameContent = await page.request.get(`/api/media-assets/${encodeURIComponent(frameAssetId)}/content`);
      expect(frameContent.ok(), `frame output content failed: ${frameContent.status()}`).toBeTruthy();
      expect([...((await frameContent.body()).subarray(0, 8))]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      await expect(frame.body.locator('img[alt="Extracted frame"]')).toBeVisible({ timeout: 30_000 });
      const frameDurable = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) => node.id === frameRecord.id && node.selectedOutputAssetId === frameAssetId),
        "completed Frame Grab output was not selected durably",
        30_000,
      );
      expect(frameDurable.nodes.find((node) => node.id === frameRecord.id)?.selectedOutputAssetId).toBe(frameAssetId);

      const stitchButton = stitch.body.getByRole("button", { name: "Stitch", exact: true });
      await expect(stitchButton).toBeEnabled({ timeout: 30_000 });
      const stitched = await runBrowserMediaOperation(page, graph.id, stitchRecord.id, stitchButton, 60_000);
      expect(stitched.plan).toMatchObject({ kind: "edit.video.stitch", outputPortId: "video", outputMediaType: "video", expectedOutputCount: 1 });
      expect(stitched.plan.inputs.map((input) => input.assetId)).toEqual([secondInputAssetId, firstInputAssetId]);
      expect(stitched.plan.inputs.map((input) => input.sortOrder)).toEqual([0, 1]);
      expect(stitched.outputAssetIds).toHaveLength(1);
      const stitchedAssetId = stitched.outputAssetIds[0];
      expect(stitchedAssetId).toEqual(expect.any(String));
      await expect(stitch.body.locator("video")).toBeVisible({ timeout: 30_000 });
      const stitchProbe = await expectPlayableVideo(stitch.body.locator("video"));
      expect(stitchProbe.duration).toBeCloseTo(2, 1);
      expect(stitchProbe).toMatchObject({ width: 640, height: 360 });
      const stitchDurable = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) => node.id === stitchRecord.id && node.selectedOutputAssetId === stitchedAssetId),
        "completed Video Stitch output was not selected durably",
        30_000,
      );
      expect(stitchDurable.nodes.find((node) => node.id === stitchRecord.id)?.selectedOutputAssetId).toBe(stitchedAssetId);

      // Ease Curve is intentionally run from the hosted toolbar: the vendored
      // EaseCurveNode has no body button and is runnable when selected.
      await ease.node.click();
      await expect(ease.node).toHaveClass(/selected/);
      const canvasToolbar = page.getByRole("toolbar", { name: "Space canvas" });
      const runSelected = canvasToolbar.getByTitle("Run selected node");
      await expect(runSelected).toBeEnabled({ timeout: 30_000 });
      const eased = await runBrowserMediaOperation(page, graph.id, easeRecord.id, runSelected, 60_000);
      expect(eased.plan).toMatchObject({ kind: "edit.video.easeCurve", outputPortId: "video", outputMediaType: "video", expectedOutputCount: 1 });
      expect(eased.plan.inputs.map((input) => input.assetId)).toEqual([firstInputAssetId]);
      expect(eased.outputAssetIds).toHaveLength(1);
      const easedAssetId = eased.outputAssetIds[0];
      expect(easedAssetId).toEqual(expect.any(String));
      const easeDurable = await waitForWorkflowState(
        page,
        graph.id,
        (snapshot) => snapshot.nodes.some((node) => node.id === easeRecord.id && node.selectedOutputAssetId === easedAssetId),
        "completed Ease Curve output was not selected durably",
        30_000,
      );
      expect(easeDurable.nodes.find((node) => node.id === easeRecord.id)?.selectedOutputAssetId).toBe(easedAssetId);
      await expect(ease.body.locator("video")).toBeVisible({ timeout: 30_000 });
      const easeProbe = await expectPlayableVideo(ease.body.locator("video"));
      expect(easeProbe).toMatchObject({ width: 640, height: 360 });

      await expect(output.body.locator("img")).toBeVisible({ timeout: 30_000 });
      await expect(gallery.body.getByRole("button", { name: "Open video 1" })).toBeVisible({ timeout: 30_000 });
      await expect(gallery.body.getByRole("button", { name: "Open video 2" })).toBeVisible({ timeout: 30_000 });
      await expect(gallery.body.getByRole("button", { name: "Open video 3" })).toBeVisible({ timeout: 30_000 });
      const outputResponse = await page.request.get(`/api/generation-graphs/${encodeURIComponent(graph.id)}/nodes/${encodeURIComponent(outputRecord.id)}/outputs`);
      expect(outputResponse.ok(), `downstream Output resolve failed: ${outputResponse.status()}`).toBeTruthy();
      expect((await outputResponse.json()).output.groups).toEqual([
        expect.objectContaining({ portId: "image", assets: [expect.objectContaining({ id: frameAssetId })] }),
      ]);
      const galleryResponse = await page.request.get(`/api/generation-graphs/${encodeURIComponent(graph.id)}/nodes/${encodeURIComponent(galleryRecord.id)}/outputs`);
      expect(galleryResponse.ok(), `downstream Output Gallery resolve failed: ${galleryResponse.status()}`).toBeTruthy();
      expect((await galleryResponse.json()).output.groups).toEqual([
        expect.objectContaining({ portId: "video", assets: [expect.objectContaining({ id: trimmedAssetId })] }),
        expect.objectContaining({ portId: "video", assets: [expect.objectContaining({ id: stitchedAssetId })] }),
        expect.objectContaining({ portId: "video", assets: [expect.objectContaining({ id: easedAssetId })] }),
      ]);

      await page.getByRole("button", { name: "Save space", exact: true }).click();
      await expect(page.locator('[data-node-banana-component="Header"] [role="status"]').filter({ hasText: /^Saved$/ })).toBeVisible({ timeout: 30_000 });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(canvas).toBeVisible({ timeout: 15_000 });
      await fitCanvas(page);
      await expect(videoInputBody(0).locator("video")).toBeVisible({ timeout: 30_000 });
      await expect(videoInputBody(1).locator("video")).toBeVisible({ timeout: 30_000 });
      await expect(nodeBody(page, "Video Trim").locator("video")).toBeVisible({ timeout: 30_000 });
      await expect(nodeBody(page, "Frame Grab").locator('img[alt="Extracted frame"]')).toBeVisible({ timeout: 30_000 });
      await expect(nodeBody(page, "Video Stitch").locator("video")).toBeVisible({ timeout: 30_000 });
      await expect(nodeBody(page, "Ease Curve").locator("video")).toBeVisible({ timeout: 30_000 });
      for (const [label, probe] of [["Video Trim", trimProbe], ["Video Stitch", stitchProbe], ["Ease Curve", easeProbe]]) {
        expect(await expectPlayableVideo(nodeBody(page, label).locator("video"))).toEqual(probe);
      }
      await expect(nodeBody(page, "Output").locator("img")).toBeVisible({ timeout: 30_000 });
      await expect(nodeBody(page, "Output Gallery").getByRole("button", { name: "Open video 1" })).toBeVisible({ timeout: 30_000 });
      await expect(nodeBody(page, "Output Gallery").getByRole("button", { name: "Open video 2" })).toBeVisible({ timeout: 30_000 });
      await expect(nodeBody(page, "Output Gallery").getByRole("button", { name: "Open video 3" })).toBeVisible({ timeout: 30_000 });
      const reloaded = await readWorkflowViaApi(page, graph.id);
      expect(reloaded.nodes.find((node) => node.id === firstInputRecord.id)?.config?.assetId).toBe(firstInputAssetId);
      expect(reloaded.nodes.find((node) => node.id === secondInputRecord?.id)?.config?.assetId).toBe(secondInputAssetId);
      expect(reloaded.nodes.find((node) => node.id === trimRecord.id)?.selectedOutputAssetId).toBe(trimmedAssetId);
      expect(reloaded.nodes.find((node) => node.id === frameRecord.id)?.selectedOutputAssetId).toBe(frameAssetId);
      expect(reloaded.nodes.find((node) => node.id === stitchRecord.id)?.selectedOutputAssetId).toBe(stitchedAssetId);
      expect(reloaded.nodes.find((node) => node.id === easeRecord.id)?.selectedOutputAssetId).toBe(easedAssetId);
      await captureEvidenceScreenshot(page, testInfo, "vendored-video-output-reload");
      expect(errors, errors.join("\n")).toEqual([]);
    } finally {
      await deleteWorkflowViaApi(page, graph.id);
    }
  });
});
