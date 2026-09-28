#!/usr/bin/env node
/**
 * ComfyUI smoke tests.
 *
 * Two tiers, because the useful checks have very different costs:
 *
 *   record   Refresh the recorded corpus from a live engine. Reads workflows
 *            and the node catalog only — no GPU, no credits.
 *   run      Drive real renders end to end: import a Blueprint, feed it, submit,
 *            poll, and check what comes back is usable. Costs credits on Cloud.
 *
 * The corpus `record` writes is what
 * `src/lib/comfy/__tests__/catalog.test.ts` runs against, hermetically, in CI.
 * That test needs no network and is where a regression should be caught; this
 * script is for the half that can only be learned by talking to an engine.
 *
 *   node scripts/comfy-smoke.mjs record
 *   node scripts/comfy-smoke.mjs run --only text_to_video_ltx_2_3
 *   node scripts/comfy-smoke.mjs run --mode local --url http://127.0.0.1:8188
 *
 * The engine is named by flags or by environment:
 *   COMFY_SMOKE_MODE   cloud | local | remote          (default cloud)
 *   COMFY_SMOKE_URL    base URL                        (default per mode)
 *   COMFY_SMOKE_KEY    API key; required for cloud
 *   COMFY_SMOKE_BASE   Node Banana dev server          (default localhost:3000)
 *
 * `run` drives Node Banana's own API routes rather than the engine directly, so
 * it exercises the same path the browser does — the import pipeline, the run
 * graph builder, and output collection included.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const FIXTURES = join(REPO, "src/lib/comfy/__tests__/fixtures/catalog");

/* ── the corpus ───────────────────────────────────────────────────── */

/**
 * Blueprints worth keeping a recording of.
 *
 * Chosen for the shapes that have actually broken, one entry per failure mode,
 * so a regression in any of them fails the hermetic test rather than waiting to
 * be noticed in a render. `why` is the reason it earns its place in the repo.
 */
const CORPUS = [
  { id: "text_to_video_ltx_2_3", why: "VIDEO sink — SaveVideo needs a codec the save never carries" },
  { id: "text_to_video_wan_2_2", why: "prompt, width, height and length all promoted onto the boundary" },
  { id: "canny_to_video_ltx_2_0", why: "one boundary slot driving three loaders at once" },
  { id: "image_captioning_gemini", why: "STRING output — a preview node would save no file" },
  { id: "image_to_model_hunyuan3d_2_1", why: "MESH output" },
  { id: "image_segmentation_sam3", why: "MASK output, which no sink takes directly" },
  { id: "image_to_gaussian_splat_triposplat", why: "SPLAT output, and a MASK input" },
  { id: "text_to_audio_ace_step_1_5", why: "PrimitiveNode — a frontend-virtual node with no backend" },
  { id: "image_edit_qwen_2509", why: "a prompt widget that was once skipped as plumbing" },
  { id: "image_outpainting_qwen_image", why: "pad amounts on the boundary; placeholder image input" },
  { id: "select_per_line_text_by_index", why: "a STRING boundary input proxied from an inner node" },
  { id: "character_replacement_scail_2_base", why: "repeated labels, and an autogrow socket group" },
  { id: "text_to_image_ernie_image", why: "a boundary slot feeding a widget and a socket at once" },
  { id: "crop_images_3x3", why: "ten outputs, one of them a batch" },
  { id: "color_curves", why: "CURVE widgets" },
  { id: "merge_videos", why: "two booleans that used to share one label" },
];

/* ── engine + arguments ───────────────────────────────────────────── */

const args = process.argv.slice(2);
const command = args[0];
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const MODE = flag("mode", process.env.COMFY_SMOKE_MODE || "cloud");
const DEFAULT_URL = MODE === "cloud" ? "https://cloud.comfy.org" : "http://127.0.0.1:8188";
const ENGINE_URL = (flag("url", process.env.COMFY_SMOKE_URL || DEFAULT_URL)).replace(/\/+$/, "");
const KEY = flag("key", process.env.COMFY_SMOKE_KEY || "");
const NB_BASE = (flag("base", process.env.COMFY_SMOKE_BASE || "http://localhost:3000")).replace(/\/+$/, "");
// A stock ComfyUI has no /api/v2 routes, so only Cloud gets the SDK engine
// unless the caller says the endpoint is proxied.
const USE_SDK = MODE === "cloud" || has("api-v2");

/** The headers the browser sends, so the routes resolve the same engine. */
const nbHeaders = () => ({
  "Content-Type": "application/json",
  "X-Comfy-Mode": MODE,
  "X-Comfy-Base-Url": ENGINE_URL,
  "X-Comfy-Api-V2": USE_SDK ? "1" : "0",
  "X-Comfy-Job-Timeout": String(Number(flag("timeout-ms", 900_000))),
  ...(KEY ? { "X-Comfy-Api-Key": KEY, "X-Comfy-Org-Key": KEY } : {}),
});

/** Auth for a direct call to the engine, bypassing Node Banana. */
const engineHeaders = () =>
  KEY ? (USE_SDK ? { Authorization: `Bearer ${KEY}` } : { "X-API-Key": KEY }) : {};

const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => console.log(`  FAIL ${m}`);

function requireKey() {
  if (MODE === "cloud" && !KEY) {
    console.error(
      "Cloud needs an API key. Pass --key, or set COMFY_SMOKE_KEY.\n" +
        "Get one from https://platform.comfy.org (it starts with `comfyui-`)."
    );
    process.exit(2);
  }
}

/* ── record ───────────────────────────────────────────────────────── */

/**
 * Trim a catalog entry down to what conversion actually reads.
 *
 * Combo options that list a server's own files — every checkpoint, LoRA and
 * uploaded image it happens to hold — are inventory, not schema. Recording them
 * would bloat the corpus and make it drift with whatever the machine had
 * installed that day, so they are capped: enough to keep "this is a combo, and
 * here is its first option" true, which is all conversion needs.
 */
const MAX_OPTIONS = 8;

function trimSpec(spec) {
  if (!Array.isArray(spec)) return spec;
  const [type, config] = spec;
  if (Array.isArray(type) && type.length > MAX_OPTIONS) {
    return [type.slice(0, MAX_OPTIONS), config];
  }
  if (config && typeof config === "object" && Array.isArray(config.options)) {
    if (config.options.length > MAX_OPTIONS) {
      return [type, { ...config, options: config.options.slice(0, MAX_OPTIONS) }];
    }
  }
  return spec;
}

function trimEntry(entry) {
  const input = entry?.input ?? {};
  const trimGroup = (group) =>
    group ? Object.fromEntries(Object.entries(group).map(([k, v]) => [k, trimSpec(v)])) : undefined;
  return {
    ...(entry.display_name ? { display_name: entry.display_name } : {}),
    ...(entry.category ? { category: entry.category } : {}),
    input: {
      ...(input.required ? { required: trimGroup(input.required) } : {}),
      ...(input.optional ? { optional: trimGroup(input.optional) } : {}),
    },
    ...(entry.output ? { output: entry.output } : {}),
  };
}

/** Classes the Blueprint importer injects that a workflow may never name. */
const INJECTED_CLASSES = [
  "SaveImage", "SaveVideo", "SaveAudio", "SaveText", "SaveGLB",
  "LoadImage", "LoadAudio", "LoadVideo",
  "MaskToImage", "ImageToMask", "SplatToFile3D", "PreviewAny",
];

async function engineJson(path) {
  const res = await fetch(`${ENGINE_URL}${path}`, { headers: engineHeaders() });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function record() {
  requireKey();
  console.log(`Recording from ${ENGINE_URL} (${MODE})`);
  mkdirSync(join(FIXTURES, "blueprints"), { recursive: true });

  const classTypes = new Set(INJECTED_CLASSES);
  const recorded = [];
  const pending = [];

  for (const { id, why } of CORPUS) {
    try {
      const entry = await engineJson(`/api/global_subgraphs/${encodeURIComponent(id)}`);
      if (!entry?.data) throw new Error("no workflow attached");
      // `data` is the workflow carried as an escaped *string*.
      const workflow = JSON.parse(entry.data);
      const collect = (graph) => {
        for (const node of graph.nodes ?? []) classTypes.add(String(node.type));
      };
      collect(workflow);
      for (const sub of workflow.definitions?.subgraphs ?? []) collect(sub);

      // Held in memory, not written yet: the catalog fetch below can still
      // fail, and fresh blueprints beside a stale object-info.json fail the
      // hermetic test with "unknown node type" rather than "re-record me".
      pending.push({
        file: join(FIXTURES, "blueprints", `${id}.json`),
        body: JSON.stringify({ name: entry.name ?? id, why, workflow }),
      });
      recorded.push({ id, name: entry.name ?? id, why });
      ok(id);
    } catch (error) {
      bad(`${id}: ${error.message}`);
    }
  }

  const catalog = await engineJson("/api/object_info");
  const trimmed = {};
  for (const type of [...classTypes].sort()) {
    if (catalog[type]) trimmed[type] = trimEntry(catalog[type]);
  }

  // Everything collected: now the corpus can be replaced as one piece.
  for (const { file, body } of pending) writeFileSync(file, body);
  writeFileSync(join(FIXTURES, "object-info.json"), JSON.stringify(trimmed));

  writeFileSync(
    join(FIXTURES, "manifest.json"),
    JSON.stringify(
      {
        note: "Recorded by scripts/comfy-smoke.mjs. Re-record with: node scripts/comfy-smoke.mjs record",
        engine: ENGINE_URL,
        blueprints: recorded,
        catalogTypes: Object.keys(trimmed).length,
      },
      null,
      2
    ) + "\n"
  );

  console.log(
    `\n${recorded.length}/${CORPUS.length} blueprints, ${Object.keys(trimmed).length} node types.`
  );
  console.log(`Written to ${FIXTURES.replace(REPO + "/", "")}`);
  if (recorded.length < CORPUS.length) process.exitCode = 1;
}

/* ── run ──────────────────────────────────────────────────────────── */

/** A 2×2 PNG, so a media input can be fed without shipping a photo. */
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAF0lEQVQIHWNkYGD4z8DAwMgABXAGNgGGAAUAAv8BpAG9AAAAAElFTkSuQmCC";

/** What to feed a text input, matched by name so a class prompt is not a scene. */
function textFor(input) {
  const l = `${input.label} ${input.name}`.toLowerCase();
  if (/negative/.test(l)) return "blurry, low quality";
  if (/\b(class|classes|category|object|target|subject|query)\b/.test(l)) return "person";
  if (/lyric/.test(l)) return "a gentle melody about the morning sea";
  if (/instruction|edit/.test(l)) return "make the background a bright blue sky";
  return "a cinematic photo of a red car on a coastal road at sunset";
}

async function nb(path, body, timeoutMs) {
  const res = await fetch(`${NB_BASE}${path}`, {
    method: "POST",
    headers: nbHeaders(),
    body: JSON.stringify(body),
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON — surfaced below */
  }
  return { res, json, text };
}

/**
 * Stop a job we are walking away from. Bounded and never throws.
 *
 * Best-effort, but not unbounded: this runs on the path that reports why the
 * run failed, so a `/api/comfy/poll` that stalls here would swallow the reason
 * as surely as it holds the credits.
 */
async function cancelRun(jobId, app) {
  await nb("/api/comfy/poll", { jobId, app, cancel: true }, 15_000).catch(() => {});
}

/** Import, feed, submit, poll, and check the result is usable. */
async function runOne(id, timeoutMs) {
  const imported = await nb("/api/comfy/blueprints", { id });
  if (!imported.res.ok || !imported.json?.success) {
    return { id, ok: false, stage: "import", error: imported.json?.error ?? imported.text.slice(0, 200) };
  }

  const s = imported.json.suggested;
  if (s.outputs.length === 0) {
    return { id, ok: false, stage: "contract", error: "no outputs — the node could emit nothing" };
  }

  const app = {
    id: `smoke_${id}`,
    name: s.name,
    description: "",
    source: "blueprint",
    graph: imported.json.graph,
    inputs: s.inputs,
    params: s.params,
    outputs: s.outputs,
    classTypes: imported.json.classTypes,
    nodeCount: imported.json.nodeCount,
    createdAt: Date.now(),
  };

  const inputs = {};
  for (const input of s.inputs) {
    inputs[input.name] = input.type === "text" ? textFor(input) : TINY_PNG;
  }
  const params = Object.fromEntries(
    s.params.filter((p) => p.default !== undefined && !p.isSeed).map((p) => [p.id, p.default])
  );

  const submitted = await nb("/api/comfy/run", {
    app,
    inputs,
    params,
    randomizeSeeds: true,
    seedKey: `smoke-${id}`,
  });
  if (!submitted.res.ok || !submitted.json?.success) {
    return { id, ok: false, stage: "submit", error: submitted.json?.error ?? submitted.text.slice(0, 200) };
  }

  const jobId = submitted.json.jobId;
  const deadline = Date.now() + timeoutMs;
  let interval = 1500;

  for (;;) {
    if (Date.now() > deadline) {
      await cancelRun(jobId, app);
      return { id, ok: false, stage: "timeout", error: `gave up after ${Math.round(timeoutMs / 60000)} min` };
    }
    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(6000, interval + 500);

    const polled = await nb("/api/comfy/poll", { jobId, app });
    if (!polled.res.ok) {
      // A route that says it could not reach the engine is reporting the
      // network, not a verdict — the render is very likely still going.
      if (polled.json?.transient) continue;
      // Giving up locally does not stop the render — and it is billed. The
      // timeout branch above already cancels; so must this one.
      await cancelRun(jobId, app);
      return { id, ok: false, stage: "run", error: polled.json?.error ?? polled.text.slice(0, 200) };
    }
    if (polled.json.polling) continue;

    const outputs = polled.json.outputs ?? [];
    const problems = [];
    for (const declared of s.outputs) {
      if (!outputs.some((o) => o.handleId === declared.id)) {
        problems.push(`declared output "${declared.label}" was never filled`);
      }
    }
    for (const o of outputs) {
      if (typeof o.value !== "string" || o.value === "") problems.push(`"${o.handleId}" is empty`);
      else if (o.type !== "text" && !o.value.startsWith("data:")) {
        problems.push(`"${o.handleId}" is not a data URL`);
      }
    }
    return problems.length > 0
      ? { id, ok: false, stage: "outputs", error: problems.join("; ") }
      : { id, ok: true, outputs: outputs.length };
  }
}

async function run() {
  requireKey();
  const only = flag("only", null);
  const ids = only ? only.split(",") : CORPUS.map((c) => c.id);
  const timeoutMs = Number(flag("timeout-ms", 900_000));

  console.log(`Running ${ids.length} blueprint(s) against ${ENGINE_URL} (${MODE})`);
  console.log(`through Node Banana at ${NB_BASE}\n`);

  const results = [];
  for (const id of ids) {
    const started = Date.now();
    const result = await runOne(id, timeoutMs).catch((error) => ({
      id,
      ok: false,
      stage: "smoke",
      error: error.message,
    }));
    const secs = Math.round((Date.now() - started) / 1000);
    results.push(result);
    if (result.ok) ok(`${id} (${secs}s, ${result.outputs} output(s))`);
    else bad(`${id} (${secs}s) [${result.stage}] ${result.error}`);
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} passed`);
  if (passed < results.length) process.exitCode = 1;
}

/* ── entry ────────────────────────────────────────────────────────── */

const USAGE = `ComfyUI smoke tests

  node scripts/comfy-smoke.mjs record      refresh the recorded corpus (no GPU, no credits)
  node scripts/comfy-smoke.mjs run         render every corpus blueprint end to end

Options
  --mode cloud|local|remote   engine kind                (COMFY_SMOKE_MODE, default cloud)
  --url  <base>               engine URL                 (COMFY_SMOKE_URL)
  --key  <key>                engine API key             (COMFY_SMOKE_KEY)
  --base <url>                Node Banana dev server     (COMFY_SMOKE_BASE, default :3000)
  --only a,b                  run just these blueprints
  --timeout-ms <n>            per-run limit              (default 900000)
  --api-v2                    local/remote endpoint speaks Comfy API v2

The hermetic half of this runs in CI with no network:
  npx vitest run src/lib/comfy/__tests__/catalog.test.ts
`;

if (command === "run" && !existsSync(FIXTURES)) {
  console.error(`No recorded corpus at ${FIXTURES}.\nRun: node scripts/comfy-smoke.mjs record`);
  process.exit(2);
}

if (command === "record") await record();
else if (command === "run") await run();
else {
  console.log(USAGE);
  if (command && command !== "help" && command !== "--help") process.exitCode = 2;
}

