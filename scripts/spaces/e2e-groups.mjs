import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const SPACES_E2E_AREAS = Object.freeze([
  "prompt", "canvas", "settings", "media", "generation", "assistant", "capture", "limits",
]);

const smokeTag = "@spaces-smoke";
const areaTags = new Set(SPACES_E2E_AREAS.map(area => "@spaces-" + area));
const execute = promisify(execFile);

function normalizeAreas(areas) {
  if (areas === null) return null;
  if (!Array.isArray(areas)) throw new Error("Spaces E2E areas must be an array or null");
  for (const area of areas) {
    if (!SPACES_E2E_AREAS.includes(area)) throw new Error("Unknown Spaces E2E area: " + area);
  }
  return SPACES_E2E_AREAS.filter(area => areas.includes(area));
}

function validateSpacesTests(tests) {
  if (!Array.isArray(tests) || tests.length === 0) throw new Error("Spaces E2E catalog is empty");
  const seen = new Set();
  return tests.map(test => {
    if (!test || typeof test.title !== "string" || !test.title.trim()
      || typeof test.projectName !== "string" || !test.projectName.trim()) {
      throw new Error("Spaces E2E case needs a title and projectName");
    }
    const identity = JSON.stringify([test.title, test.projectName]);
    if (seen.has(identity)) throw new Error("Duplicate Spaces E2E case: " + identity);
    seen.add(identity);
    if (!Array.isArray(test.tags) || test.tags.some(tag => typeof tag !== "string" || !tag.trim())) {
      throw new Error("Spaces E2E case needs tags: " + identity);
    }
    // Playwright's JSON reporter removes the leading @ from metadata tags.
    const tags = [...new Set(test.tags.map(tag => tag.startsWith("@") ? tag : "@" + tag))];
    for (const tag of tags) {
      if (tag.startsWith("@spaces-") && tag !== smokeTag && !areaTags.has(tag)) {
        throw new Error("Unknown Spaces E2E tag " + tag + " in " + identity);
      }
    }
    if (!tags.some(tag => areaTags.has(tag))) throw new Error("Missing Spaces E2E area tag: " + identity);
    return { title: test.title, projectName: test.projectName, tags };
  });
}

// Include file/describe ancestry in titles, keeping identically named cases in
// different suites distinct while still rejecting duplicate project executions.
export function flattenSpacesTests(report) {
  if (!report || !Array.isArray(report.suites)
    || (report.errors !== undefined && !Array.isArray(report.errors))) {
    throw new Error("Invalid Spaces E2E collection report");
  }
  if (report.errors?.length) throw new Error("Spaces E2E collection reported errors");
  const tests = [];
  function visit(suite, ancestry) {
    if (!suite || typeof suite.title !== "string"
      || (suite.specs !== undefined && !Array.isArray(suite.specs))
      || (suite.suites !== undefined && !Array.isArray(suite.suites))) {
      throw new Error("Invalid Spaces E2E suite");
    }
    const path = [...ancestry, suite.title].filter(Boolean);
    for (const spec of suite.specs ?? []) {
      if (!spec || typeof spec.title !== "string" || !spec.title.trim()
        || !Array.isArray(spec.tests) || spec.tests.length === 0) {
        throw new Error("Invalid Spaces E2E spec");
      }
      for (const test of spec.tests) {
        tests.push({ title: [...path, spec.title].join(" › "), projectName: test?.projectName, tags: spec.tags });
      }
    }
    for (const child of suite.suites ?? []) visit(child, path);
  }
  for (const suite of report.suites) visit(suite, []);
  return validateSpacesTests(tests);
}

export async function collectSpacesTests(rootDirectory = process.cwd(), environment = process.env, selectionArguments = []) {
  // Collection must never start the configured app, even when a caller's
  // environment requests it. Reporter env overrides must not redirect JSON.
  const env = { ...environment, E2E_START_SERVER: "0" };
  for (const key of ["PLAYWRIGHT_JSON_OUTPUT_FILE", "PLAYWRIGHT_JSON_OUTPUT_NAME", "PLAYWRIGHT_JSON_OUTPUT_DIR"]) delete env[key];
  const { stdout } = await execute("pnpm", [
    "exec", "playwright", "test", "--config=playwright.spaces.config.mjs", ...selectionArguments, "--list", "--reporter=json", "--forbid-only",
  ], { cwd: rootDirectory, env, maxBuffer: 16 * 1024 * 1024 });
  let report;
  try { report = JSON.parse(stdout); }
  catch { throw new Error("Spaces E2E collection did not return a JSON report"); }
  return flattenSpacesTests(report);
}

export function selectSpacesTests(tests, areas = null) {
  const selectedAreas = normalizeAreas(areas);
  const catalog = validateSpacesTests(tests);
  if (selectedAreas === null) return catalog;
  const tags = new Set([smokeTag, ...selectedAreas.map(area => "@spaces-" + area)]);
  const selected = catalog.filter(test => test.tags.some(tag => tags.has(tag)));
  if (selected.length === 0) throw new Error("Spaces E2E selection is empty");
  return selected;
}

export function spacesGrepForAreas(areas = null) {
  const selectedAreas = normalizeAreas(areas);
  if (selectedAreas === null) return undefined;
  return "(?:^|\\s)@spaces-(?:" + ["smoke", ...selectedAreas].join("|") + ")(?=\\s|$)";
}

const selectionFlags = new Set([
  "--grep", "--grep-invert", "--project", "--shard", "--repeat-each", "--last-failed", "--only-changed",
  "--test-list", "--test-list-invert", "--config", "--list", "--pass-with-no-tests", "-g", "-c",
]);
const executionValueFlags = new Set([
  "--workers", "-j", "--reporter", "--output", "--trace", "--retries", "--timeout", "--global-timeout", "--max-failures",
]);
const executionBooleanFlags = new Set([
  "--headed", "--quiet", "--fully-parallel", "--forbid-only", "--fail-on-flaky-tests", "-x",
]);

export function parseSpacesE2EArguments(arguments_) {
  let areas = null;
  const playwrightArgs = [];
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument !== "--areas" && !argument.startsWith("--areas=")) {
      playwrightArgs.push(argument);
      continue;
    }
    if (areas !== null) throw new Error("Pass --areas only once");
    const value = argument === "--areas" ? arguments_[++index] : argument.slice("--areas=".length);
    if (!value?.trim() || value.startsWith("-")) throw new Error("--areas requires comma-separated areas or smoke");
    const requested = value.split(",").map(area => area.trim());
    areas = requested.length === 1 && requested[0] === "smoke" ? [] : normalizeAreas(requested);
  }
  if (areas === null) return { areas, playwrightArgs };

  // Unknown options are rejected in area mode, so new Playwright selection
  // flags cannot silently narrow a planned union. Manual mode stays untouched.
  for (let index = 0; index < playwrightArgs.length; index += 1) {
    const argument = playwrightArgs[index];
    const flag = argument.split("=", 1)[0];
    if (selectionFlags.has(flag) || /^-[gc].+/.test(argument)) {
      throw new Error("--areas cannot be combined with Playwright selection option " + flag);
    }
    if (/^-j.+/.test(argument)) continue;
    if (executionBooleanFlags.has(argument)) continue;
    if (executionValueFlags.has(flag)) {
      const value = argument.includes("=") ? argument.slice(argument.indexOf("=") + 1) : playwrightArgs[++index];
      if (!value || value.startsWith("-")) throw new Error(flag + " requires a value");
      continue;
    }
    throw new Error("--areas cannot be combined with Playwright argument " + argument);
  }
  return { areas, playwrightArgs };
}
