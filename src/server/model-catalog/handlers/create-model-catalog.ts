import { prisma } from "@/server/db/prisma";
import {
  modelCatalogInputSchema,
  type ModelCatalogInput,
} from "@/server/model-catalog/catalog-schema";
import { invalidateModelCatalogCache } from "@/server/model-catalog/catalog-service";

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

    return tx.modelCatalog.create({ data });
  });

  invalidateModelCatalogCache();

  return created;
}
