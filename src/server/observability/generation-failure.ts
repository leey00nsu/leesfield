import { logStructured } from "@/server/observability/request-observability";

type GenerationKind = "image" | "video" | "audio";

const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;
const FALLBACK_ERROR_CODE = "GENERATION_PROVIDER_FAILED";

export function generationProviderErrorCode(error: unknown) {
  if (!(error instanceof Error)) return FALLBACK_ERROR_CODE;

  const errorWithCode = error as Error & { code?: unknown };
  const candidate =
    typeof errorWithCode.code === "string"
      ? errorWithCode.code
      : error.message.split(":", 1)[0];

  const normalized = candidate.trim();
  return SAFE_ERROR_CODE.test(normalized)
    ? normalized
    : FALLBACK_ERROR_CODE;
}

export function logGenerationProviderFailure(
  fields: {
    requestId: string;
    kind: GenerationKind;
    modelKey: string;
  },
  error: unknown,
) {
  logStructured(
    "generation.provider_failed",
    {
      requestId: fields.requestId,
      kind: fields.kind,
      modelKey: fields.modelKey,
      errorCode: generationProviderErrorCode(error),
    },
    "error",
  );
}

