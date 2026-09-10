import {getGradioContract,gradioInputValues} from "@/shared/model-catalog/gradio-contract";
import type { VideoGenerationAdapter } from "./types";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import { executeModalWorkflow } from "@/server/modal-comfyui/executor";
import { ModalApiError } from "@/server/modal-comfyui/client";
import { modalOutputMetadata } from "@/server/modal-comfyui/output-metadata";

export const modalComfyVideoAdapter: VideoGenerationAdapter = {
 async generate(payload,context) {
  const { modalJobRepository } = await import("@/server/modal-comfyui/job-repository");
  if(!context?.requestId) throw new ModalApiError("MODAL_REQUEST_ID_REQUIRED");
  const model=context.executionModel??(await getModelCatalog({includeInactive:true})).find(m=>m.type==="video"&&m.key===payload.model);
  if(!model || model.provider!=="modal_comfyui") throw new ModalApiError("MODAL_MODEL_NOT_FOUND");
  const result=await executeModalWorkflow(model.providerConfig,{...payload,dynamicParams:gradioInputValues(getGradioContract(model)!,payload)},context.requestId,modalJobRepository);
  return {videos:result.urls,meta:await modalOutputMetadata(result.urls,"video")};
 },
 mapError(error) {
  console.error("[modal-comfyui] video failure", {code:error instanceof ModalApiError?error.code:"MODAL_INTERNAL_ERROR",errorType:error instanceof Error?error.name:typeof error});
  return error instanceof ModalApiError ? "Modal 생성 실패: "+error.code : "Modal 내부 처리에 실패했습니다. 서버 로그를 확인해주세요.";
 },
};
