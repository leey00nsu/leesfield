import { withExternalModelAdmin } from "@/server/model-catalog/external-admin-http";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import { createModelCatalogHandler } from "@/server/model-catalog/handlers/create-model-catalog";
import { projectExternalAdminModel } from "@/server/model-catalog/external-model-projection";
import { externalAdminModelCreateSchema, externalAdminModelQuerySchema } from "@/shared/api/platform-admin-contract";
export const dynamic = "force-dynamic";
async function getObservedHandler(request: Request) {
  return withExternalModelAdmin(request, async () => {
    const search = new URL(request.url).searchParams;
    const query = externalAdminModelQuerySchema.parse(Object.fromEntries(["type", "q", "includeInactive"].flatMap((key) => search.has(key) ? [[key, search.get(key)]] : [])));
    const catalog = await getModelCatalog({ includeInactive: query.includeInactive !== "false" && query.includeInactive !== "0", bypassCache: true });
    const needle = query.q?.trim().toLowerCase() ?? "";
    return { items: catalog.filter((item) => (!query.type || item.type === query.type) && (!needle || (item.label + " " + item.key).toLowerCase().includes(needle))).map(projectExternalAdminModel) };
  });
}
async function postObservedHandler(request: Request) {
  return withExternalModelAdmin(request, async (body) => projectExternalAdminModel(await createModelCatalogHandler(externalAdminModelCreateSchema.parse(body))), { body: true, status: 201 });
}

import { withRequestObservability } from "@/server/observability/request-observability";
export const GET = withRequestObservability("/api/external/admin/models", getObservedHandler);
export const POST = withRequestObservability("/api/external/admin/models", postObservedHandler);
