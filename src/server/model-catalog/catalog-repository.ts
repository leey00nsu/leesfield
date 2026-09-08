import { normalizeGradioModel } from "@/shared/model-catalog/gradio-contract";
import { prisma } from "@/server/db/prisma";

export type ModelCatalogQuery = {
  includeInactive?: boolean;
};

export async function listModelCatalogRecords(params: ModelCatalogQuery = {}) {
  const records = await prisma.modelCatalog.findMany({
    where: params.includeInactive ? undefined : { isActive: true },
    orderBy: [{ type: "asc" }, { key: "asc" }],
  });
  return records.map(normalizeGradioModel);
}

export async function getModelCatalogRecordByKey(key: string) {
  const record = await prisma.modelCatalog.findUnique({ where: { key } });
  return record ? normalizeGradioModel(record) : null;
}
