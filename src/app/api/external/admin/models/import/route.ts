import { withExternalModelAdmin } from "@/server/model-catalog/external-admin-http";
import { importModelDraftFromSpace } from "@/server/model-catalog/space-importer";
import { projectExternalModelDraft } from "@/server/model-catalog/external-model-projection";
import { externalAdminHfImportSchema, externalAdminHfImportResponseSchema } from "@/shared/api/platform-admin-contract";
import { GRAPH_BODY_LIMIT_BYTES } from "@/server/http/bounded-body";
import { buildErrorResponse } from "@/server/http/response";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return withExternalModelAdmin(request, async (body) => {
    const input = externalAdminHfImportSchema.parse(body);
    try {
      const result = await importModelDraftFromSpace(input);
      return externalAdminHfImportResponseSchema.parse({ ...result, draft: projectExternalModelDraft(result.draft) });
    } catch (error) {
      const code = error instanceof Error && ["INVALID_SPACE_URL", "SPACE_CONFIG_NOT_FOUND", "SPACE_API_NOT_FOUND", "SPACE_ID_UNRESOLVED"].includes(error.message) ? error.message : "IMPORT_FAILED";
      return buildErrorResponse(code, 400);
    }
  }, { body: true, maxBytes: GRAPH_BODY_LIMIT_BYTES });
}
