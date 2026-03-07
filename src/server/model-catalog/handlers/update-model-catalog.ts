import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import {
  modelCatalogInputSchema,
  type ModelCatalogInput,
} from "@/server/model-catalog/catalog-schema";
import {
  getModelCatalogRecordByKey,
} from "@/server/model-catalog/catalog-repository";
import { invalidateModelCatalogCache } from "@/server/model-catalog/catalog-service";

const updatePayloadSchema = z.object({
  type: z.enum(["image", "video", "audio"]).optional(),
  key: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  vendor: z.string().min(1).optional(),
  provider: z.literal("hf_space").optional(),
  providerConfig: z.record(z.string(), z.unknown()).optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

function toInput(record: {
  type: string;
  key: string;
  label: string;
  vendor: string;
  provider: string;
  providerConfig: unknown;
  parameters: unknown;
  meta: unknown;
  isActive: boolean;
  isDefault: boolean;
}): ModelCatalogInput {
  return {
    type: record.type as ModelCatalogInput["type"],
    key: record.key,
    label: record.label,
    vendor: record.vendor,
    provider: record.provider as ModelCatalogInput["provider"],
    providerConfig: record.providerConfig as ModelCatalogInput["providerConfig"],
    parameters: record.parameters as ModelCatalogInput["parameters"],
    meta: record.meta as ModelCatalogInput["meta"],
    isActive: record.isActive,
    isDefault: record.isDefault,
  } as ModelCatalogInput;
}

export async function updateModelCatalogHandler(params: {
  key: string;
  payload: unknown;
}) {
  const parsed = updatePayloadSchema.safeParse(params.payload);
  if (!parsed.success) {
    const error = new Error("INVALID_PAYLOAD");
    (error as Error & { details?: unknown }).details = parsed.error.flatten();
    throw error;
  }

  const existing = await getModelCatalogRecordByKey(params.key);
  if (!existing) {
    throw new Error("MODEL_NOT_FOUND");
  }

  if (parsed.data.type && parsed.data.type !== existing.type) {
    throw new Error("TYPE_IMMUTABLE");
  }

  if (parsed.data.key && parsed.data.key !== existing.key) {
    throw new Error("KEY_IMMUTABLE");
  }

  const base = toInput(existing);
  const merged = {
    ...base,
    ...parsed.data,
    type: base.type,
    key: base.key,
  } as ModelCatalogInput;

  const validated = modelCatalogInputSchema.safeParse(merged);
  if (!validated.success) {
    const error = new Error("INVALID_PAYLOAD");
    (error as Error & { details?: unknown }).details = validated.error.flatten();
    throw error;
  }

  const data = validated.data;

  const updated = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.modelCatalog.updateMany({
        where: { type: data.type, isDefault: true, key: { not: data.key } },
        data: { isDefault: false },
      });
    }

    return tx.modelCatalog.update({
      where: { key: params.key },
      data: {
        type: data.type,
        label: data.label,
        vendor: data.vendor,
        provider: data.provider,
        providerConfig: data.providerConfig as Prisma.InputJsonValue,
        parameters: data.parameters as Prisma.InputJsonValue,
        meta: data.meta as Prisma.InputJsonValue,
        isActive: data.isActive ?? true,
        isDefault: data.isDefault ?? false,
      },
    });
  });

  invalidateModelCatalogCache();

  return updated;
}
