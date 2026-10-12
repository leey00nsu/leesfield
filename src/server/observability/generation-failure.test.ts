import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  generationProviderErrorCode,
  logGenerationProviderFailure,
} from "./generation-failure";

describe("generation provider failure logging", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("알려진 오류 식별자만 구조화 로그에 기록한다", () => {
    logGenerationProviderFailure(
      {
        requestId: "request-1",
        kind: "image",
        modelKey: "image-model",
      },
      new Error("HF_SPACE_REQUEST_TIMEOUT"),
    );

    expect(JSON.parse(String(vi.mocked(console.error).mock.calls[0]?.[0]))).toMatchObject({
      event: "generation.provider_failed",
        requestId: "request-1",
        kind: "image",
        modelKey: "image-model",
        errorCode: "HF_SPACE_REQUEST_TIMEOUT",
    });
  });

  it("자유 형식 오류 메시지는 로그에 노출하지 않는다", () => {
    const sensitiveMessage = "request failed with Bearer secret-token";

    expect(generationProviderErrorCode(new Error(sensitiveMessage))).toBe(
      "GENERATION_PROVIDER_FAILED",
    );
    logGenerationProviderFailure(
      {
        requestId: "request-2",
        kind: "audio",
        modelKey: "audio-model",
      },
      new Error(sensitiveMessage),
    );

    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      sensitiveMessage,
    );
  });
  it("separates storage failure and retains safe causes and phase", () => {
    const error = new Error("MODAL_STORAGE_FAILED", {cause:new Error("LEEMAGE_CONFIRM_INVALID")});
    logGenerationProviderFailure({requestId:"req",kind:"video",modelKey:"modal-model",provider:"leemage",phase:"storage.upload"},error);
    expect(JSON.parse(String(vi.mocked(console.error).mock.calls[0]?.[0]))).toMatchObject({
      event:"generation.storage_failed",provider:"leemage",phase:"storage.upload",
      error:{code:"MODAL_STORAGE_FAILED",cause:{code:"LEEMAGE_CONFIRM_INVALID"}},
    });
  });
});

