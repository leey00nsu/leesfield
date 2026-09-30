import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  modelCatalogInputSchema,
  type ModelCatalogInput,
} from "@/server/model-catalog/catalog-schema";
import { invalidateModelCatalogCache } from "@/server/model-catalog/catalog-service";
import { encryptModelApiKey } from "@/server/model-catalog/model-credential";

function normalizeInput(input: ModelCatalogInput) {
  return {
    ...input,
    isActive: input.isActive ?? true,
    isDefault: input.isDefault ?? false,
  };
}

export async function createModelCatalogHandler(payload: unknown) {
  const parsed = modelCatalogInputSchema.safeParse(payload);
  if (!parsed.success) {
    const error = new Error("INVALID_PAYLOAD");
    (error as Error & { details?: unknown }).details = parsed.error.flatten();
    throw error;
  }

  const data = normalizeInput(parsed.data);
  const rawApiKey = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>).apiKey : undefined;
  if (rawApiKey !== undefined && (data.type !== "llm" || typeof rawApiKey !== "string")) {
    throw new Error("INVALID_PAYLOAD");
  }
  if (data.type === "llm" && data.isActive && !(typeof rawApiKey === "string" && rawApiKey.trim())) {
    throw new Error("MODEL_API_KEY_REQUIRED");
  }
  const credential = typeof rawApiKey === "string" && rawApiKey.trim()
    ? encryptModelApiKey(rawApiKey) : null;

  const existing = await prisma.modelCatalog.findUnique({
    where: { key: data.key },
    select: { id: true },
  });

  if (existing) {
    throw new Error("MODEL_KEY_EXISTS");
  }

  const created = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.modelCatalog.updateMany({
        where: { type: data.type, isDefault: true },
        data: { isDefault: false },
      });
    }

    const model = await tx.modelCatalog.create({
      data: {
        ...data,
        providerConfig: data.providerConfig as Prisma.InputJsonValue,
        parameters: data.parameters as Prisma.InputJsonValue,
        meta: data.meta as Prisma.InputJsonValue,
      },
    });
    if (credential) await tx.modelCredential.create({ data: { modelId: model.id, ...credential } });
    return model;
  });

  invalidateModelCatalogCache();

  return { ...created, ...(data.type === "llm" ? { hasApiKey: Boolean(credential) } : {}) };
}
