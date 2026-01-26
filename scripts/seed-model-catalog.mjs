import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const ROOT = process.cwd();

function loadEnvFromFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function loadJson(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function toJson(value, fallback = {}) {
  return JSON.parse(JSON.stringify(value ?? fallback));
}

function resolveDefaultKey(models, configured) {
  if (typeof configured === "string" && configured) {
    const exists = models.some((model) => model.key === configured);
    if (exists) return configured;
  }
  if (models.length === 0) {
    throw new Error("MODEL_CATALOG_EMPTY");
  }
  return models[0].key;
}

function mapImageCatalog(catalog) {
  const models = Array.isArray(catalog?.models) ? catalog.models : [];
  const defaultKey = resolveDefaultKey(models, catalog?.default_model);

  return models.map((model) => ({
    type: "image",
    key: model.key,
    label: model.label,
    vendor: model.vendor,
    provider: model.provider,
    providerConfig: toJson(model.provider_config, {}),
    parameters: toJson(model.parameters, {}),
    meta: toJson({
      pipeline: model.pipeline,
      model_id: model.model_id,
      default_width: model.default_width,
      default_height: model.default_height,
      default_steps: model.default_steps,
      concurrent_limit: model.concurrent_limit ?? null,
      max_input_images: model.max_input_images,
    }),
    isActive: true,
    isDefault: model.key === defaultKey,
  }));
}

function mapVideoCatalog(catalog) {
  const models = Array.isArray(catalog?.models) ? catalog.models : [];
  const defaultKey = resolveDefaultKey(models, catalog?.default_model);

  return models.map((model) => ({
    type: "video",
    key: model.key,
    label: model.label,
    vendor: model.vendor,
    provider: model.provider,
    providerConfig: toJson(model.provider_config, {}),
    parameters: toJson(model.parameters, {}),
    meta: toJson({
      supports_init_image: model.supports_init_image,
      t2v_model_id: model.t2v_model_id,
      i2v_model_id: model.i2v_model_id ?? null,
      default_width: model.default_width,
      default_height: model.default_height,
      default_duration_sec: model.default_duration_sec,
      default_fps: model.default_fps,
      default_steps: model.default_steps,
      default_guidance_scale: model.default_guidance_scale,
      concurrent_limit: model.concurrent_limit ?? null,
    }),
    isActive: true,
    isDefault: model.key === defaultKey,
  }));
}

async function upsertModels(prisma, items) {
  let created = 0;
  let updated = 0;

  for (const item of items) {
    const existing = await prisma.modelCatalog.findUnique({
      where: { key: item.key },
      select: { isActive: true },
    });

    if (existing) {
      await prisma.modelCatalog.update({
        where: { key: item.key },
        data: {
          type: item.type,
          label: item.label,
          vendor: item.vendor,
          provider: item.provider,
          providerConfig: item.providerConfig,
          parameters: item.parameters,
          meta: item.meta,
          isDefault: item.isDefault,
          isActive: existing.isActive,
        },
      });
      updated += 1;
      continue;
    }

    await prisma.modelCatalog.create({
      data: item,
    });
    created += 1;
  }

  return { created, updated };
}

async function main() {
  loadEnvFromFile();

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }

  const imageCatalog = loadJson("configs/image-models.json");
  const videoCatalog = loadJson("configs/video-models.json");
  const items = [...mapImageCatalog(imageCatalog), ...mapVideoCatalog(videoCatalog)];

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const result = await upsertModels(prisma, items);
    console.log(
      `[seed] model catalog: created ${result.created}, updated ${result.updated}`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[seed] failed:", error);
  process.exit(1);
});
