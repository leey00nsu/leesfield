import { failureLogContext } from "./logger";
import { MediaOutputError } from "@/server/media-assets/binary-media-output";
import { serializeError } from "@/shared/logging/logger.mjs";
import { logSafeError } from "@/server/observability/request-observability";

type GenerationKind = "image" | "video" | "audio";

export function generationProviderErrorCode(error: unknown, phase = "") {
  return serializeError(error).code ?? (phase.startsWith("storage") ? "GENERATION_STORAGE_FAILED" : phase.startsWith("result.") ? "GENERATION_POSTPROCESSING_FAILED" : "GENERATION_PROVIDER_FAILED");
}

export function logGenerationProviderFailure(
  fields: {
    requestId: string;
    kind: GenerationKind;
    modelKey: string;
    provider?: string;
    phase?: string;
  },
  error: unknown,
) {
  const phase = generationFailurePhase(error, fields.phase);
  logSafeError(
    phase?.startsWith("storage") ? "generation.storage_failed" : phase?.startsWith("result.") ? "generation.postprocessing_failed" : "generation.provider_failed",
    error,
    { ...fields, phase, errorCode: generationProviderErrorCode(error, phase) },
  );
}


/** Public messages reflect the failing boundary, never arbitrary exception text. */
export function generationFailureMessage(
  fields: { kind: GenerationKind; phase: string },
  error: unknown,
  providerMessage: () => string,
) {
  const phase = generationFailurePhase(error, fields.phase);
  const code = generationProviderErrorCode(error, phase);
  const media = fields.kind === "video" ? "영상" : fields.kind === "image" ? "이미지" : "오디오";
  if (phase === "result.metadata" || phase === "storage.metadata")
    return media + " 메타데이터 분석에 실패했습니다. (" + code + ")";
  if (phase.startsWith("result."))
    return media + " 결과 처리에 실패했습니다. (" + code + ")";
  if (phase.startsWith("storage"))
    return media + " 저장에 실패했습니다. (" + code + ")";
  return providerMessage();
}


export function generationFailurePhase(error: unknown, fallback = "") {
  if (error instanceof MediaOutputError) return error.phase;
  const phase = failureLogContext(error)?.phase;
  return typeof phase === "string" ? phase : fallback;
}

