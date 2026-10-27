import { execFile, spawn } from "node:child_process";
import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { existsSync, readFileSync, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseEnv, promisify } from "node:util";
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { LeemageClient } from "leemage-sdk";
import bcrypt from "bcryptjs";
import { selectTier, validateTierCatalog } from "./e2e-tiers.mjs";
import { startAssistantProvider } from "./assistant-transport.mjs";
import { sealData } from "iron-session";
import { startLocalStorage } from "./local-storage.mjs";
import { startStorageAdmission } from "./storage-admission.mjs";
import { collectSpacesTests, parseSpacesE2EArguments, selectSpacesTests, spacesGrepForAreas } from "./e2e-groups.mjs";
import { createRunMetrics } from "./run-metrics.mjs";
import { createSpacesWorkspace } from "./isolated-workspace.mjs";
import { resolveSpacesWorkerBudget } from "./worker-budget.mjs";

// Never use a developer database/server. Only storage credentials are inherited;
// all records and uploaded files belong to resources created by this process.
for (const path of [".env.local", ".env"]) if (existsSync(path)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(path, "utf8")))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
const suffix = randomUUID().slice(0, 8), container = "leesfield-spaces-e2e-" + suffix;
const database = "spaces_e2e_" + suffix, password = randomBytes(24).toString("hex");
const execute = promisify(execFile), children = new Set();
let containerStarted = false, projectId, storage, storageAdmission, localStorage, assistantProvider, workspace, stopping = false;
const tier = process.argv.includes("--core") ? "core" : "all";
const contractProfile = process.argv.includes("--storage-contract");
const storageMode = contractProfile ? "real" : process.env.SPACES_E2E_STORAGE_MODE ?? "local";
const playwrightConfig = contractProfile ? "playwright.storage.config.mjs" : "playwright.spaces.config.mjs";
if (!["local", "real"].includes(storageMode)) throw new Error("Unknown Spaces storage mode");
const lockDirectory = await mkdtemp(join(tmpdir(), "leesfield-spaces-e2e-"));
const output = ".next/spaces-e2e/" + suffix;
await mkdir(output, { recursive: true });
const metrics = createRunMetrics(output);

async function command(binary, args, env, log) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { env, stdio: log ? ["ignore", log, log] : "inherit" });
    children.add(child);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      children.delete(child);
      if (code === 0) resolve(); else reject(new Error(binary + " failed (" + (signal ?? code) + ")"));
    });
  });
}
async function docker(args) { return execute("docker", args, { timeout: 30_000, maxBuffer: 128 * 1024 }); }
async function waitFor(check, label, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (stopping) throw new Error("Spaces verification cancelled");
    try { if (await check()) return; } catch { /* The isolated service is starting. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("Timed out waiting for " + label);
}
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
let cleanupPromise;
function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  stopping = true;
  cleanupPromise = (async () => {
    for (const child of children) child.kill("SIGTERM");
    await Promise.all([...children].map(child => new Promise(resolve => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 5_000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
    })));
    const results = await Promise.allSettled([
      projectId && storage ? storage.projects.delete(projectId) : undefined,
      containerStarted ? docker(["rm", "--force", container]) : undefined,
      workspace?.cleanup(), storageAdmission?.close(), localStorage?.close(), assistantProvider?.close(),
      rm(lockDirectory, { recursive: true, force: true }),
    ]);
    if (results.some(result => result.status === "rejected")) {
      process.exitCode = 1;
      throw new Error("Could not clean up all isolated Spaces resources");
    }
  })();
  return cleanupPromise;
}
process.once("SIGINT", () => { process.exitCode = 130; void cleanup().catch(() => { process.exitCode = 1; }); });
process.once("SIGTERM", () => { process.exitCode = 143; void cleanup(); });

async function seed(url, encryptionKey, providerOrigin) {
  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const items = [];
    for (const type of ["image", "video"]) {
      const source = JSON.parse(readFileSync("configs/" + type + "-models.json", "utf8"));
      for (const model of source.models) {
        if (model.parameters.seed?.ui === "input" && model.parameters.seed.default === "") delete model.parameters.seed.default;
        const metaKeys = type === "image"
          ? ["pipeline", "model_id", "default_width", "default_height", "default_steps", "concurrent_limit", "max_input_images"]
          : ["supports_init_image", "t2v_model_id", "i2v_model_id", "default_width", "default_height", "default_duration_sec", "default_fps", "default_steps", "default_guidance_scale", "concurrent_limit"];
        items.push({ type, key: model.key, label: model.label, vendor: model.vendor, provider: model.provider,
          providerConfig: model.provider_config, parameters: model.parameters,
          meta: Object.fromEntries(metaKeys.filter(key => model[key] !== undefined).map(key => [key, model[key]])),
          isActive: true, isDefault: model.key === source.default_model });
      }
    }
    items.push({ type: "audio", key: "spaces-e2e-audio", label: "Spaces Test Audio", vendor: "Hugging Face", provider: "hf_space",
      providerConfig: { space_id: "fixture/audio", api_name: "/generate" },
      parameters: { prompt: { ui: "textarea", required: true }, speed: { ui: "range", min: 0.5, max: 2, default: 1, step: 0.1 }, seed: { ui: "input" } },
      meta: { model_id: "fixture/audio", default_speed: 1, supports_input_audio: true }, isActive: true, isDefault: true });
    for (const id of ["a", "b"]) items.push({ type: "llm", key: "spaces-e2e-llm-" + id, label: "Spaces Test Assistant " + id.toUpperCase(),
      vendor: "OpenAI", provider: "openai_compatible", providerConfig: { base_url: providerOrigin + "/v1", model_id: "fixture-" + id, supports_images: true },
      parameters: {}, meta: {}, isActive: true, isDefault: false });
    // Scope TypeScript/alias resolution to loading the same parser used by the product.
    const { createRequire, registerHooks } = await import("node:module");
    const sourceRoot = new URL("../../src/", import.meta.url);
    const hook = registerHooks({
      resolve(specifier, context, nextResolve) {
        const fromSource = context.parentURL?.startsWith(sourceRoot.href);
        if (fromSource && specifier.startsWith("@/")) specifier = new URL(specifier.slice(2), sourceRoot).href;
        if (fromSource && (specifier.startsWith(sourceRoot.href) || specifier.startsWith(".")) && !/\.[^/]+$/.test(specifier)) specifier += ".ts";
        try { return nextResolve(specifier, context); }
        catch (error) {
          if (fromSource && error.code === "ERR_MODULE_NOT_FOUND") return nextResolve(createRequire(context.parentURL).resolve(specifier), context);
          throw error;
        }
      },
    });
    let modelCatalogInputSchema;
    try { ({ modelCatalogInputSchema } = await import("../../src/server/model-catalog/catalog-schema.ts")); }
    finally { hook.deregister(); }
    const fixtures = items.map(item => modelCatalogInputSchema.parse(item));
    for (const item of fixtures) {
      const model = await prisma.modelCatalog.create({ data: item });
      if (item.type === "llm") {
        const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", Buffer.from(encryptionKey, "base64"), iv);
        const ciphertext = Buffer.concat([cipher.update("isolated-provider-key", "utf8"), cipher.final()]);
        await prisma.modelCredential.create({ data: { modelId: model.id, ciphertext: ciphertext.toString("base64"),
          iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") } });
      }
    }
    // This newly migrated, disposable DB has no legacy work to backfill.
    await prisma.queueRuntime.update({ where: { id: 1 }, data: { mode: "shared", migrationVerified: true } });
    process.stdout.write("Seeded isolated model catalog (" + items.length + " fixtures)\n");
  } finally { await prisma.$disconnect(); await pool.end(); }
}

try {
  // Playwright CLI flags override config.workers. Validate before creating
  // remote storage or Docker resources, including the short -j form.
  const { areas, playwrightArgs: args } = parseSpacesE2EArguments(process.argv.slice(2).filter(argument => argument !== "--storage-contract" && argument !== "--core"));
  if (tier === "core") {
    if (areas !== null) throw new Error("Core E2E cannot be narrowed by areas");
    parseSpacesE2EArguments(["--areas", "smoke", ...args]);
  }
  const workerBudget = await resolveSpacesWorkerBudget(process.env);
  let workerCount = workerBudget.workers;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    let value;
    if (argument === "--workers" || argument === "-j") value = args[++index];
    else if (argument.startsWith("--workers=")) value = argument.slice("--workers=".length);
    else if (/^-j.+/.test(argument)) value = argument.slice(2).replace(/^=/, "");
    else continue;
    if (!/^[1-4]$/.test(value ?? "")) throw new Error("Spaces E2E workers must be an integer between 1 and 4");
    workerCount = Number(value);
    workerBudget.source = "command-line";
  }
  if (!/^[1-4]$/.test(process.env.SPACES_E2E_WORKERS ?? "4")) throw new Error("SPACES_E2E_WORKERS must be between 1 and 4");
  if (contractProfile && (tier !== "all" || args.length || areas !== null)) throw new Error("The mandatory real storage profile does not allow selection overrides");
  if (contractProfile && process.env.SPACES_E2E_LOCAL_STORAGE) throw new Error("Real storage profile cannot inherit local transport");
  // List the unique selected cases; Playwright repeats them only at execution.
  // Listing repeats creates duplicate identities in the canonical catalog.
  const collectionArgs = [];
  let repeatEach = 1;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--repeat-each" || argument.startsWith("--repeat-each=")) {
      const value = argument === "--repeat-each" ? args[++index] : argument.slice("--repeat-each=".length);
      if (!/^[1-9]\d*$/.test(value ?? "")) throw new Error("--repeat-each requires a positive integer");
      repeatEach = Number(value);
    } else collectionArgs.push(argument);
  }
  const collectionEnv = { ...process.env, SPACES_E2E_TIER: "all" };
  if (!contractProfile) validateTierCatalog(await collectSpacesTests(process.cwd(), collectionEnv));
  const catalog = contractProfile ? [{ title: "real Leemage app file lifecycle", projectName: "storage-contract", tags: ["@spaces-media"] }] : await collectSpacesTests(process.cwd(), collectionEnv, areas === null ? collectionArgs : []);
  if (stopping) throw new Error("Spaces verification cancelled");
  const selected = contractProfile ? selectSpacesTests(catalog, areas) : selectTier(selectSpacesTests(catalog, areas), tier);
  const areaLabel = areas === null ? "full (manual Playwright filters preserved)" : areas.length ? areas.join(",") + " + smoke" : "smoke";
  process.stdout.write("Spaces E2E selection: " + selected.length * repeatEach + "/" + catalog.length * repeatEach + " executions; tier=" + tier + "; areas=" + areaLabel + "\n");
  workerBudget.workers = contractProfile ? 1 : workerCount;
  if (contractProfile) workerBudget.source = "fixed-storage-contract";
  metrics.configure({ profile: contractProfile ? "storage-contract" : tier, mode: storageMode, workers: workerBudget.workers, workerBudget, selected: Array.from({ length: repeatEach }, () => selected).flat() });
  process.stdout.write("Browser workers: " + workerBudget.workers + "; " + workerBudget.source + "\n");
  const grep = spacesGrepForAreas(areas);
  if (grep !== undefined) args.push("--grep", grep);
  if (storageMode === "real" && (!process.env.LEEMAGE_API_KEY?.trim() || !process.env.LEEMAGE_PROJECT_ID?.trim())) {
    throw new Error("Spaces E2E requires configured LEEMAGE_API_KEY and LEEMAGE_PROJECT_ID to create and clean up an isolated storage project.");
  }
  workspace = await metrics.phase("source-copy", () => createSpacesWorkspace(process.cwd(), { profile: contractProfile ? "storage-contract" : "development" }));
  metrics.compilerCache(workspace.cache);
  if (stopping) { await workspace.cleanup(); throw new Error("Spaces verification cancelled"); }
  if (storageMode === "real") {
  storage = new LeemageClient({ apiKey: process.env.LEEMAGE_API_KEY, baseUrl: process.env.LEEMAGE_BASE_URL || "https://leemage.leey00nsu.com", timeout: 30_000,
    allowInsecureHttp: process.env.LEEMAGE_BASE_URL?.startsWith("http://") === true });
  const existing = await storage.projects.get(process.env.LEEMAGE_PROJECT_ID);
  const project = await storage.projects.create({ name: "Spaces E2E " + suffix, description: "Temporary isolated browser verification; removed after the run.", storageProvider: existing.storageProvider });
  projectId = project.id;
  } else {
    localStorage = await metrics.phase("storage-prepare", startLocalStorage);
    projectId = localStorage.projectId;
  }
  await docker(["run", "--detach", "--rm", "--name", container, "--env", "POSTGRES_DB=" + database, "--env", "POSTGRES_USER=" + database,
    "--env", "POSTGRES_PASSWORD=" + password, "--tmpfs", "/var/lib/postgresql/data:rw,size=1g", "--publish", "127.0.0.1::5432", "postgres:16"]);
  containerStarted = true;
  let port;
  await waitFor(async () => { const result = await docker(["port", container, "5432/tcp"]); port = Number(result.stdout.match(/:(\d+)\s*$/m)?.[1]); return Boolean(port); }, "isolated PostgreSQL port", 30_000);
  await waitFor(async () => (await docker(["exec", container, "pg_isready", "-U", database, "-d", database])).stdout.includes("accepting"), "isolated PostgreSQL", 60_000);
  const databaseUrl = "postgresql://" + database + ":" + password + "@127.0.0.1:" + port + "/" + database;
  // Next's development-origin guard accepts localhost. The browser must use
  // that origin for both HTTP and HMR while the isolated DB stays on loopback.
  const appPort = await freePort(), base = "http://localhost:" + appPort;
  if (storageMode === "real") storageAdmission = await startStorageAdmission();
  assistantProvider = await startAssistantProvider();
  const encryptionKey = randomBytes(32).toString("base64"), loginPassword = randomBytes(24).toString("hex");
  const env = { ...process.env, SPACES_E2E_TIER: tier, ADMIN_EMAIL: "spaces-login-" + suffix + "@example.test",
    ADMIN_PASSWORD_HASH: Buffer.from(await bcrypt.hash(loginPassword, 10)).toString("base64url"),
    SPACES_E2E_LOGIN_PASSWORD: loginPassword, MODEL_CREDENTIAL_ENCRYPTION_KEY: encryptionKey,
    SPACES_E2E_ASSISTANT_URL: assistantProvider.url, SPACES_E2E_ASSISTANT_ORIGIN: assistantProvider.origin,
    SPACES_E2E_ASSISTANT_TOKEN: assistantProvider.token, CI: "1", NODE_ENV: "development", DATABASE_URL: databaseUrl, SESSION_PASSWORD: randomBytes(40).toString("hex"),
    DEV_AUTH_BYPASS: "false", APP_ORIGIN: base, SPACES_E2E_LOCK_DIR: lockDirectory,
    NODE_STUDIO_E2E_DIST_DIR: ".next", NODE_STUDIO_E2E_MOCK_GENERATION: "1", SPACES_E2E_ISOLATED: "1",
    SPACES_E2E_MODULE_ROOT: workspace.moduleRoot, SPACES_E2E_OUTPUT_DIR: resolve(output), SPACES_E2E_WORKERS: String(workerBudget.workers),
    LEEMAGE_BASE_URL: process.env.LEEMAGE_BASE_URL || "https://leemage.leey00nsu.com",
    LEEMAGE_PROJECT_ID: projectId,
    ...(localStorage ? { LEEMAGE_API_KEY: localStorage.token, LEEMAGE_BASE_URL: localStorage.origin, SPACES_E2E_LOCAL_STORAGE: localStorage.url, SPACES_E2E_LOCAL_TOKEN: localStorage.token } : {}),
    IMAGE_STORAGE_PROVIDER: "leemage", VIDEO_STORAGE_PROVIDER: "leemage", AUDIO_STORAGE_PROVIDER: "leemage",
    ...(storageAdmission ? { SPACES_E2E_STORAGE_GATE: storageAdmission.url, SPACES_E2E_STORAGE_TOKEN: storageAdmission.token } : {}),
    SPACES_E2E_STORAGE_PROFILE: contractProfile ? "contract" : "browser",
    SPACES_BASE_URL: base, E2E_START_SERVER: "0" };
  const serverEnv = { ...env,
    LEEMAGE_BASE_URL: localStorage?.origin ?? process.env.LEEMAGE_BASE_URL ?? "https://leemage.leey00nsu.com",
    ...(storageAdmission ? { SPACES_E2E_STORAGE_GATE: storageAdmission.url, SPACES_E2E_STORAGE_TOKEN: storageAdmission.token } : {}),
  };
  await metrics.phase("database-prepare", async () => {
    await command("pnpm", ["db:generate"], env);
    await command("pnpm", ["db:migrate:deploy"], env);
    await seed(databaseUrl, encryptionKey, assistantProvider.origin);
  });
  const log = createWriteStream(output + "/server.log", { flags: "w" });
  await once(log, "open");
  const server = spawn(process.execPath, ["--import", new URL("./assistant-preload.mjs", import.meta.url).href, "--import", new URL(localStorage ? "./local-storage-preload.mjs" : "./storage-fetch.mjs", import.meta.url).href,
    "node_modules/next/dist/bin/next", "dev", "--port", String(appPort)], { cwd: workspace.directory, env: serverEnv, stdio: ["ignore", log, log] });
  children.add(server); server.once("exit", () => children.delete(server));
  const readinessCookie = await sealData({ isLoggedIn: true, adminEmail: `spaces-ready-${suffix}@localhost` }, { password: env.SESSION_PASSWORD });
  await metrics.phase("api-ready", () => waitFor(async () => (await fetch(base + "/api/generation-graphs", { headers: { Cookie: "leesfield_session=" + readinessCookie } })).ok, "isolated Spaces API"));
  process.stdout.write(`Running native Spaces browser checks with a disposable database and ${storageMode} storage project\n`);
  process.stdout.write("Compiler cache: " + JSON.stringify(workspace.cache) + "; reports: " + output + "\n");
  await metrics.phase("browser", () => command("pnpm", ["exec", "playwright", "test", "--config=" + playwrightConfig, ...args], env));
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : "Spaces E2E failed") + "\n");
  process.exitCode = 1;
} finally {
  try { await metrics.phase("cleanup", cleanup); }
  catch { process.exitCode = 1; }
  await metrics.finish(!process.exitCode, localStorage?.snapshot() ?? storageAdmission?.snapshot());
}
