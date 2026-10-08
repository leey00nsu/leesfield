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
export async function GET(request: Request) {
  return withExternalModelAdmin(request, async () => {
    try { return externalAdminModalListSchema.parse(await listModalAdminWorkflows()); } catch (error) { return failure(error); }
  });
}
export async function POST(request: Request) {
  return withExternalModelAdmin(request, async (body) => {
    try {
      const result = await importModalAdminWorkflow(body);
      return externalAdminModalImportResponseSchema.parse({ draft: projectExternalModelDraft(result.draft) });
    } catch (error) { return failure(error); }
  }, { body: true });
}
