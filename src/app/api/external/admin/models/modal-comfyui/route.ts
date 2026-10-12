import { withExternalModelAdmin } from "@/server/model-catalog/external-admin-http";
import { listModalAdminWorkflows, importModalAdminWorkflow } from "@/server/model-catalog/modal-admin-service";
import { projectExternalModelDraft } from "@/server/model-catalog/external-model-projection";
import { externalAdminModalListSchema, externalAdminModalImportResponseSchema } from "@/shared/api/platform-admin-contract";
import { ModalApiError } from "@/server/modal-comfyui/client";
import { buildErrorResponse } from "@/server/http/response";
export const dynamic = "force-dynamic";
const safeCodes = new Set(["MODAL_NOT_CONFIGURED", "MODAL_CONNECTION_INVALID", "MODAL_RESPONSE_TOO_LARGE", "MODAL_EMPTY_RESPONSE", "MODAL_PATH_INVALID", "MODAL_TIMEOUT", "MODAL_NETWORK", "MODAL_RESPONSE_INVALID", "MODAL_WORKFLOW_MISMATCH"]);
function failure(error: unknown) {
  const code = error instanceof ModalApiError && (safeCodes.has(error.code) || /^MODAL_HTTP_[1-5][0-9]{2}$/.test(error.code)) ? error.code : "MODAL_CONTRACT_INVALID";
  return buildErrorResponse(code, 400);
}
async function getObservedHandler(request: Request) {
  return withExternalModelAdmin(request, async () => {
    try { return externalAdminModalListSchema.parse(await listModalAdminWorkflows()); } catch (error) {
    logSafeError("http.handler.failed", error, {phase:"request.handle"}); return failure(error); }
  });
}
async function postObservedHandler(request: Request) {
  return withExternalModelAdmin(request, async (body) => {
    try {
      const result = await importModalAdminWorkflow(body);
      return externalAdminModalImportResponseSchema.parse({ draft: projectExternalModelDraft(result.draft) });
    } catch (error) {
    logSafeError("http.handler.failed", error, {phase:"request.handle"}); return failure(error); }
  }, { body: true });
}

import { withRequestObservability } from "@/server/observability/request-observability";
export const GET = withRequestObservability("/api/external/admin/models/modal-comfyui", getObservedHandler);
export const POST = withRequestObservability("/api/external/admin/models/modal-comfyui", postObservedHandler);

import { logSafeError } from "@/server/observability/request-observability";
