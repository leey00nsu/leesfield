import type { ModalConfig } from "@/shared/model-catalog/modal-comfyui-contract";
import { mediaUploadLimits } from "@/shared/media-assets/media-upload-limits.mjs";

/** Imported 20 MiB was the old local buffer default, not an upstream file schema.
 * Keep explicit per-model operator overrides; other advertised budgets still cap uploads.
 */
export function modalInputUploadBudget(config: ModalConfig): number {
  const configured = config.limits?.max_input_bytes;
  if (configured !== undefined) return configured;
  const advertised = config.workflow.limits?.max_input_bytes;
  if (advertised !== undefined && advertised !== 20_971_520 && advertised !== 52_428_800) return advertised;
  return Math.max(...Object.values(mediaUploadLimits()));
}
