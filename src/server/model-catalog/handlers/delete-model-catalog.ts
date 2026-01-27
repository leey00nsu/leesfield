import { prisma } from "@/server/db/prisma";
import { getModelCatalogRecordByKey } from "@/server/model-catalog/catalog-repository";
import { invalidateModelCatalogCache } from "@/server/model-catalog/catalog-service";

export async function deleteModelCatalogHandler(key: string) {
  const existing = await getModelCatalogRecordByKey(key);
  if (!existing) {
    throw new Error("MODEL_NOT_FOUND");
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const removed = await tx.modelCatalog.delete({ where: { key } });

    if (existing.isDefault) {
      const replacement = await tx.modelCatalog.findFirst({
        where: { type: existing.type, isActive: true },
        orderBy: [{ updatedAt: "desc" }],
      });

      if (replacement && !replacement.isDefault) {
        await tx.modelCatalog.update({
          where: { key: replacement.key },
          data: { isDefault: true },
        });
      }
    }

    return removed;
  });

  invalidateModelCatalogCache();
  return deleted;
}

