import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLogStructured = vi.hoisted(() => vi.fn());

vi.mock("@/server/observability/request-observability", () => ({
  logStructured: mockLogStructured,
}));

import {
  generationProviderErrorCode,
  logGenerationProviderFailure,
} from "./generation-failure";

describe("generation provider failure logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    expect(mockLogStructured).toHaveBeenCalledWith(
      "generation.provider_failed",
      {
        requestId: "request-1",
        kind: "image",
        modelKey: "image-model",
        errorCode: "HF_SPACE_REQUEST_TIMEOUT",
      },
      "error",
    );
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

    expect(JSON.stringify(mockLogStructured.mock.calls)).not.toContain(
      sensitiveMessage,
    );
  });
});

