import { withExternalModelAdmin } from "@/server/model-catalog/external-admin-http";
import { updateModelCatalogHandler } from "@/server/model-catalog/handlers/update-model-catalog";
import { deleteModelCatalogHandler } from "@/server/model-catalog/handlers/delete-model-catalog";
import { projectExternalAdminModel } from "@/server/model-catalog/external-model-projection";
import { externalAdminModelUpdateSchema } from "@/shared/api/platform-admin-contract";
type Context = { params: Promise<{ modelKey: string }> };
export const dynamic = "force-dynamic";
async function patchObservedHandler(request: Request, context: Context) {
  return withExternalModelAdmin(request, async (body) => projectExternalAdminModel(await updateModelCatalogHandler({ key: (await context.params).modelKey, payload: externalAdminModelUpdateSchema.parse(body) })), { body: true });
}
async function deleteObservedHandler(request: Request, context: Context) {
  return withExternalModelAdmin(request, async () => projectExternalAdminModel(await deleteModelCatalogHandler((await context.params).modelKey)));
}

import { withRequestObservability } from "@/server/observability/request-observability";
export const PATCH = withRequestObservability("/api/external/admin/models/[modelKey]", patchObservedHandler);
export const DELETE = withRequestObservability("/api/external/admin/models/[modelKey]", deleteObservedHandler);
