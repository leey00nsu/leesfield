import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetModelCatalog = vi.hoisted(() => vi.fn());

vi.mock("@/server/model-catalog/catalog-service", () => ({
  getModelCatalog: mockGetModelCatalog,
}));

const pngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function mockCatalog(providerConfigOverrides: Record<string, unknown> = {}) {
  mockGetModelCatalog.mockResolvedValue([
    {
      id: "image-model-bridge",
      type: "image",
      key: "gpt-image-2-bridge",
      label: "GPT Image 2 Bridge",
      vendor: "OPENAI",
      provider: "codex_bridge",
      providerConfig: {
        base_url_env: "CODEX_IMAGE_BRIDGE_URL",
        token_env: "CODEX_IMAGE_BRIDGE_TOKEN",
        model_id: "gpt-image-2",
        agent_model: "gpt-5.5",
        timeout_ms: 300000,
        ...providerConfigOverrides,
      },
      parameters: {
        prompt: { ui: "textarea", required: true },
      },
      meta: {
        pipeline: "image_generation",
        model_id: "gpt-image-2",
        default_width: 1024,
        default_height: 1024,
        default_steps: 1,
        max_input_images: 1,
      },
      isActive: true,
      isDefault: false,
    },
  ]);
}

function payload(overrides = {}) {
  return {
    prompt: "a small red house",
    model: "gpt-image-2-bridge",
    width: 1024,
    height: 1024,
    imageCount: 1,
    steps: 1,
    seed: "",
    initImages: [],
    ...overrides,
  };
}

function response(body: unknown, init?: ResponseInit) {
  const headers = new Headers({ "content-type": "application/json" });
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers,
  });
}

describe("codexBridgeImageAdapter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.stubEnv("CODEX_IMAGE_BRIDGE_URL", "http://codex-bridge.internal:18080");
    vi.stubEnv("CODEX_IMAGE_BRIDGE_TOKEN", "secret-token");
    mockCatalog();
  });

  it("bridge에 생성 요청을 보내고 data URL 이미지를 반환한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ images: [pngDataUrl] }));
    vi.stubGlobal("fetch", fetchMock);

    const { codexBridgeImageAdapter } = await import(
      "@/server/image-generation/adapters/codex-bridge-adapter"
    );

    await expect(codexBridgeImageAdapter.generate(payload())).resolves.toEqual({
      images: [pngDataUrl],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://codex-bridge.internal:18080/v1/images/generate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer secret-token",
          "content-type": "application/json",
        }),
        body: expect.any(String),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body).toEqual({
      prompt: "a small red house",
      modelId: "gpt-image-2",
      agentModel: "gpt-5.5",
      width: 1024,
      height: 1024,
      initImages: [],
    });
  });

  it("init image를 resolver로 검증한 뒤 data URL로 bridge에 전달한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ images: [pngDataUrl] }));
    vi.stubGlobal("fetch", fetchMock);

    const { codexBridgeImageAdapter } = await import(
      "@/server/image-generation/adapters/codex-bridge-adapter"
    );

    await codexBridgeImageAdapter.generate(payload({ initImages: [pngDataUrl] }));

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.initImages).toEqual([pngDataUrl]);
  });

  it("agent_model이 생략되면 gpt-5.5를 기본 agentModel로 전달한다", async () => {
    mockCatalog({ agent_model: undefined });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ images: [pngDataUrl] }));
    vi.stubGlobal("fetch", fetchMock);

    const { codexBridgeImageAdapter } = await import(
      "@/server/image-generation/adapters/codex-bridge-adapter"
    );

    await codexBridgeImageAdapter.generate(payload());

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.agentModel).toBe("gpt-5.5");
  });

  it("bridge URL 또는 token env가 없으면 사용자 메시지로 매핑한다", async () => {
    vi.stubEnv("CODEX_IMAGE_BRIDGE_URL", "");
    const { codexBridgeImageAdapter } = await import(
      "@/server/image-generation/adapters/codex-bridge-adapter"
    );

    await expect(codexBridgeImageAdapter.generate(payload())).rejects.toThrow(
      "CODEX_BRIDGE_URL_REQUIRED",
    );
    expect(
      codexBridgeImageAdapter.mapError?.(new Error("CODEX_BRIDGE_URL_REQUIRED")),
    ).toBe("Codex bridge URL이 설정되어 있지 않습니다.");

    vi.resetModules();
    vi.stubEnv("CODEX_IMAGE_BRIDGE_URL", "http://codex-bridge.internal:18080");
    vi.stubEnv("CODEX_IMAGE_BRIDGE_TOKEN", "");
    const { codexBridgeImageAdapter: reloadedAdapter } = await import(
      "@/server/image-generation/adapters/codex-bridge-adapter"
    );
    await expect(reloadedAdapter.generate(payload())).rejects.toThrow(
      "CODEX_BRIDGE_TOKEN_REQUIRED",
    );
    expect(
      reloadedAdapter.mapError?.(new Error("CODEX_BRIDGE_TOKEN_REQUIRED")),
    ).toBe("Codex bridge token이 설정되어 있지 않습니다.");
  });

  it("bridge URL 형식 오류를 누락과 구분해 매핑한다", async () => {
    const { codexBridgeImageAdapter } = await import(
      "@/server/image-generation/adapters/codex-bridge-adapter"
    );

    for (const invalidUrl of [
      "not-a-url",
      "ftp://codex-bridge.internal",
      "http://codex-bridge.internal:18080/api",
    ]) {
      vi.stubEnv("CODEX_IMAGE_BRIDGE_URL", invalidUrl);
      await expect(codexBridgeImageAdapter.generate(payload())).rejects.toThrow(
        "CODEX_BRIDGE_URL_INVALID",
      );
    }

    expect(
      codexBridgeImageAdapter.mapError?.(
        new Error("CODEX_BRIDGE_URL_INVALID"),
      ),
    ).toBe(
      "Codex bridge URL 형식이 올바르지 않습니다. http(s) origin만 입력해주세요.",
    );
  });

  it("bridge 인증 실패와 timeout을 구분해 매핑한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ error: { code: "UNAUTHORIZED" } }, { status: 401 }))
      .mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));
    vi.stubGlobal("fetch", fetchMock);

    const { codexBridgeImageAdapter } = await import(
      "@/server/image-generation/adapters/codex-bridge-adapter"
    );

    await expect(codexBridgeImageAdapter.generate(payload())).rejects.toThrow(
      "CODEX_BRIDGE_AUTH_FAILED",
    );
    await expect(codexBridgeImageAdapter.generate(payload())).rejects.toThrow(
      "CODEX_BRIDGE_TIMEOUT",
    );
    expect(
      codexBridgeImageAdapter.mapError?.(new Error("CODEX_BRIDGE_AUTH_FAILED")),
    ).toBe("Codex bridge 인증에 실패했습니다. bridge token 설정을 확인해주세요.");
    expect(
      codexBridgeImageAdapter.mapError?.(new Error("CODEX_BRIDGE_TIMEOUT")),
    ).toBe("Codex bridge 이미지 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.");
  });

  it("bridge 비정상 응답과 빈 이미지 결과를 구분해 매핑한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("not json", { status: 200 }))
      .mockResolvedValueOnce(response({ images: [] }))
      .mockResolvedValueOnce(response({ error: { code: "CODEX_IMAGE_GENERATION_FAILED" } }, { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);

    const { codexBridgeImageAdapter } = await import(
      "@/server/image-generation/adapters/codex-bridge-adapter"
    );

    await expect(codexBridgeImageAdapter.generate(payload())).rejects.toThrow(
      "CODEX_BRIDGE_BAD_RESPONSE",
    );
    await expect(codexBridgeImageAdapter.generate(payload())).rejects.toThrow(
      "CODEX_BRIDGE_OUTPUT_NOT_FOUND",
    );
    await expect(codexBridgeImageAdapter.generate(payload())).rejects.toThrow(
      "CODEX_BRIDGE_BAD_STATUS",
    );
    expect(
      codexBridgeImageAdapter.mapError?.(new Error("CODEX_BRIDGE_BAD_STATUS")),
    ).toBe("Codex bridge 호출에 실패했습니다. bridge 서비스 상태를 확인해주세요.");
  });

  it("bridge response body 파싱 중에도 timeout을 적용한다", async () => {
    vi.useFakeTimers();
    mockCatalog({ timeout_ms: 10 });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(() => new Promise(() => undefined)),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { codexBridgeImageAdapter } = await import(
      "@/server/image-generation/adapters/codex-bridge-adapter"
    );

    const generation = expect(codexBridgeImageAdapter.generate(payload())).rejects.toThrow(
      "CODEX_BRIDGE_TIMEOUT",
    );
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10);
    await generation;
  });
});
