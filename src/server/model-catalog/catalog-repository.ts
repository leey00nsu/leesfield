import { prisma } from "@/server/db/prisma";

export type ModelCatalogQuery = {
  includeInactive?: boolean;
};

export async function listModelCatalogRecords(params: ModelCatalogQuery = {}) {
  return prisma.modelCatalog.findMany({
    where: params.includeInactive ? undefined : { isActive: true },
    orderBy: [{ type: "asc" }, { key: "asc" }],
  });
}

export async function getModelCatalogRecordByKey(key: string) {
  return prisma.modelCatalog.findUnique({ where: { key } });
}
