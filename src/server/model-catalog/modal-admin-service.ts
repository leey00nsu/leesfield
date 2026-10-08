import { z } from "zod";
import { createModalClient, ModalApiError } from "@/server/modal-comfyui/client";
import { buildModalModelDraft } from "@/server/modal-comfyui/importer";
import { modalExecutionLimitsSchema, modalExecutionLimits } from "@/shared/model-catalog/modal-comfyui-contract";
import { externalAdminModalImportSchema } from "@/shared/api/platform-admin-contract";

export async function listModalAdminWorkflows() {
  const data = z.object({ workflows: z.array(z.unknown()).max(100) }).parse(await createModalClient().json("/api/workflows"));
  return { items: data.workflows.flatMap<{ id: string; name: string; type: string; supported: boolean; message: string | null; limits?: z.infer<typeof modalExecutionLimitsSchema> }>((raw) => {
    const id = (raw as { id?: unknown })?.id;
    if ((raw as { category?: unknown })?.category === "audio") return [];
    try {
      const draft = buildModalModelDraft(raw);
      return [{ id: String(id), name: draft.label, type: draft.type, supported: true, message: null,
        limits: draft.provider === "modal_comfyui" ? modalExecutionLimits(draft.providerConfig) : undefined }];
    } catch { return [{ id: String(id), name: String(id), type: "unknown", supported: false, message: "MODAL_CONTRACT_INVALID" }]; }
  }) };
}
export async function importModalAdminWorkflow(body: unknown) {
  const { workflowId, limits, timeoutMs } = externalAdminModalImportSchema.parse(body);
  const draft = buildModalModelDraft(await createModalClient().json("/api/workflows/" + workflowId));
  if (draft.provider !== "modal_comfyui" || draft.providerConfig.workflow_id !== workflowId) throw new ModalApiError("MODAL_WORKFLOW_MISMATCH");
  draft.providerConfig = { ...draft.providerConfig, ...(limits ? { limits } : {}), ...(timeoutMs ? { timeout_ms: timeoutMs } : {}) };
  return { draft };
}
