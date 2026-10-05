import { Prisma, type PromptPreset as PromptPresetRow } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { builtinPromptPresets, findBuiltinPromptPreset } from "@/shared/prompt-presets/builtin-prompt-presets";
import {
  builtinPromptPresetSchema, createPromptPresetSchema, updatePromptPresetSchema,
  promptPresetKeySchema, promptPresetModalitySchema, promptPresetRevisionSchema,
  type PromptPreset,
} from "@/shared/prompt-presets/prompt-preset-contract";
import { PromptPresetError } from "./prompt-preset-errors";

export const MAX_PERSONAL_PROMPT_PRESETS = 200;
export const promptPresetListQuerySchema = z.object({
  modality: promptPresetModalitySchema.optional(),
  includeInactive: z.boolean().default(false),
}).strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new PromptPresetError("INVALID_REQUEST", 400);
  return result.data;
}

function effective(row: PromptPresetRow): PromptPreset {
  const builtin = row.builtinKey ? findBuiltinPromptPreset(row.builtinKey) : undefined;
  if (row.builtinKey && !builtin) throw new PromptPresetError("PRESET_NOT_FOUND", 404);
  const base = builtinPromptPresetSchema.parse({
    key: row.key, revision: row.revision, name: row.name, description: row.description,
    modality: builtin?.modality ?? row.modality,
    prompt: row.prompt ?? builtin?.prompt,
    requiredInputs: builtin?.requiredInputs ?? row.requiredInputs,
    recommendedParameters: builtin?.recommendedParameters ?? row.recommendedParameters,
  });
  return {
    ...base, builtinKey: row.builtinKey, builtinRevision: builtin?.revision ?? null,
    defaultPrompt: builtin?.prompt ?? null, isActive: row.isActive,
    isModified: Boolean(builtin && (row.prompt !== null || row.name !== builtin.name || row.description !== builtin.description)),
  };
}

function untouched(key: string): PromptPreset | null {
  const builtin = findBuiltinPromptPreset(key);
  return builtin ? {
    ...builtin, builtinKey: key, builtinRevision: builtin.revision,
    defaultPrompt: builtin.prompt, isActive: true, isModified: false,
  } : null;
}

async function lockOwner(tx: Prisma.TransactionClient, ownerEmail: string) {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${"prompt-presets:" + ownerEmail}))`);
}

async function current(tx: Prisma.TransactionClient, ownerEmail: string, key: string) {
  const row = await tx.promptPreset.findUnique({ where: { ownerEmail_key: { ownerEmail, key } } });
  if (row?.deletedAt) throw new PromptPresetError("PRESET_NOT_FOUND", 404);
  const preset = row ? effective(row) : untouched(key);
  if (!preset) throw new PromptPresetError("PRESET_NOT_FOUND", 404);
  return { row, preset };
}

function checkRevision(actual: number, expected: number) {
  if (actual !== expected) throw new PromptPresetError("PRESET_CONFLICT", 409);
}

function validateModality(preset: Pick<PromptPreset, "modality" | "requiredInputs" | "recommendedParameters">) {
  if (preset.modality === "audio" && (preset.requiredInputs.referenceImageCount > 0 || preset.recommendedParameters.aspectRatio)) {
    throw new PromptPresetError("INVALID_REQUEST", 400);
  }
  if (preset.modality !== "image" && preset.recommendedParameters.imageCount !== undefined) {
    throw new PromptPresetError("INVALID_REQUEST", 400);
  }
}

export const promptPresetService = {
  async list(ownerEmail: string, query: unknown = {}): Promise<PromptPreset[]> {
    const options = parse(promptPresetListQuerySchema, query);
    const rows = await prisma.promptPreset.findMany({
      where: { ownerEmail, deletedAt: null },
      orderBy: [{ name: "asc" }, { key: "asc" }],
      take: MAX_PERSONAL_PROMPT_PRESETS + builtinPromptPresets.length,
    });
    const keys = new Set(rows.map((row) => row.key));
    return [
      ...builtinPromptPresets.filter((preset) => !keys.has(preset.key)).map((preset) => untouched(preset.key)!),
      ...rows.map(effective),
    ].filter((preset) => (options.includeInactive || preset.isActive) &&
      (!options.modality || preset.modality === options.modality));
  },

  async get(ownerEmail: string, untrustedKey: string): Promise<PromptPreset> {
    const key = parse(promptPresetKeySchema, untrustedKey);
    const row = await prisma.promptPreset.findUnique({ where: { ownerEmail_key: { ownerEmail, key } } });
    if (row?.deletedAt) throw new PromptPresetError("PRESET_NOT_FOUND", 404);
    const preset = row ? effective(row) : untouched(key);
    if (!preset) throw new PromptPresetError("PRESET_NOT_FOUND", 404);
    return preset;
  },

  async create(ownerEmail: string, input: unknown): Promise<PromptPreset> {
    const data = parse(createPromptPresetSchema, input);
    validateModality(data);
    if (findBuiltinPromptPreset(data.key)) throw new PromptPresetError("PRESET_CONFLICT", 409);
    return prisma.$transaction(async (tx) => {
      await lockOwner(tx, ownerEmail);
      if (await tx.promptPreset.findUnique({ where: { ownerEmail_key: { ownerEmail, key: data.key } } })) {
        throw new PromptPresetError("PRESET_CONFLICT", 409);
      }
      if (await tx.promptPreset.count({ where: { ownerEmail, builtinKey: null, deletedAt: null } }) >= MAX_PERSONAL_PROMPT_PRESETS) {
        throw new PromptPresetError("PRESET_LIMIT_REACHED", 409);
      }
      return effective(await tx.promptPreset.create({ data: { ...data, ownerEmail, builtinKey: null } }));
    });
  },

  async update(ownerEmail: string, untrustedKey: string, input: unknown): Promise<PromptPreset> {
    const key = parse(promptPresetKeySchema, untrustedKey);
    const { expectedRevision, ...changes } = parse(updatePromptPresetSchema, input);
    return prisma.$transaction(async (tx) => {
      await lockOwner(tx, ownerEmail);
      const { row, preset } = await current(tx, ownerEmail, key);
      checkRevision(preset.revision, expectedRevision);
      if (preset.builtinKey && (changes.modality !== undefined || changes.requiredInputs !== undefined || changes.recommendedParameters !== undefined)) {
        throw new PromptPresetError("INVALID_REQUEST", 400);
      }
      validateModality({ ...preset, ...changes });
      const data = { ...changes, revision: preset.revision + 1 };
      return effective(row
        ? await tx.promptPreset.update({ where: { id: row.id }, data })
        : await tx.promptPreset.create({ data: {
          ownerEmail, key, builtinKey: key, name: preset.name, description: preset.description,
          modality: preset.modality, requiredInputs: preset.requiredInputs, recommendedParameters: preset.recommendedParameters,
          ...data,
        } }));
    });
  },

  async restore(ownerEmail: string, untrustedKey: string, input: unknown): Promise<PromptPreset> {
    const key = parse(promptPresetKeySchema, untrustedKey);
    const { expectedRevision } = parse(promptPresetRevisionSchema, input);
    const builtin = findBuiltinPromptPreset(key);
    if (!builtin) throw new PromptPresetError("INVALID_REQUEST", 400);
    return prisma.$transaction(async (tx) => {
      await lockOwner(tx, ownerEmail);
      const { row, preset } = await current(tx, ownerEmail, key);
      checkRevision(preset.revision, expectedRevision);
      const data = { prompt: null, name: builtin.name, description: builtin.description, revision: preset.revision + 1 };
      return effective(row
        ? await tx.promptPreset.update({ where: { id: row.id }, data })
        : await tx.promptPreset.create({ data: {
          ownerEmail, key, builtinKey: key, modality: builtin.modality,
          requiredInputs: builtin.requiredInputs, recommendedParameters: builtin.recommendedParameters, ...data,
        } }));
    });
  },

  async remove(ownerEmail: string, untrustedKey: string, input: unknown): Promise<void> {
    const key = parse(promptPresetKeySchema, untrustedKey);
    const { expectedRevision } = parse(promptPresetRevisionSchema, input);
    if (findBuiltinPromptPreset(key)) throw new PromptPresetError("INVALID_REQUEST", 400);
    await prisma.$transaction(async (tx) => {
      await lockOwner(tx, ownerEmail);
      const { row, preset } = await current(tx, ownerEmail, key);
      checkRevision(preset.revision, expectedRevision);
      if (!row) throw new PromptPresetError("PRESET_NOT_FOUND", 404);
      await tx.promptPreset.update({ where: { id: row.id }, data: {
        isActive: false, deletedAt: new Date(), revision: preset.revision + 1,
        prompt: null, name: "", description: "", requiredInputs: {}, recommendedParameters: {},
      } });
    });
  },
};
