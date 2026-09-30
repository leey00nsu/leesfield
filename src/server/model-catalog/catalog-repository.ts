import { normalizeGradioModel } from "@/shared/model-catalog/gradio-contract";
import { prisma } from "@/server/db/prisma";

export type ModelCatalogQuery = {
  includeInactive?: boolean;
};

export async function listModelCatalogRecords(params: ModelCatalogQuery = {}) {
  const records = await prisma.modelCatalog.findMany({
    where: params.includeInactive ? undefined : { isActive: true },
    orderBy: [{ type: "asc" }, { key: "asc" }],
    include: { credential: { select: { id: true } } },
  });
  return records.map(({ credential, ...record }) => normalizeGradioModel({
    ...record,
    ...(record.type === "llm" ? { hasApiKey: Boolean(credential) } : {}),
  }));
}

export async function getModelCatalogRecordByKey(key: string) {
  const record = await prisma.modelCatalog.findUnique({
    where: { key },
    include: { credential: { select: { id: true } } },
  });
  if (!record) return null;
  const { credential, ...model } = record;
  return normalizeGradioModel({
    ...model,
    ...(model.type === "llm" ? { hasApiKey: Boolean(credential) } : {}),
  });
}
