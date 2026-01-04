import { requestModalGeneration } from "@/server/image-generation/modal-client";
import { imageGenerationDefaults } from "@/features/image-generation/model/image-generation-schema";

const baseEnv = {
  MODAL_IMAGE_ENDPOINT: process.env.MODAL_IMAGE_ENDPOINT,
  MODAL_PROXY_KEY: process.env.MODAL_PROXY_KEY,
  MODAL_PROXY_SECRET: process.env.MODAL_PROXY_SECRET,
  MODAL_TIMEOUT_MS: process.env.MODAL_TIMEOUT_MS,
};

describe("requestModalGeneration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.assign(process.env, baseEnv);
  });

  const applyModalEnv = () => {
    Object.assign(process.env, {
      MODAL_IMAGE_ENDPOINT: "https://example.com/generate",
      MODAL_PROXY_KEY: "proxy-key",
      MODAL_PROXY_SECRET: "proxy-secret",
      MODAL_TIMEOUT_MS: "120000",
    });
  };

  it("필수 환경 변수가 없으면 오류를 반환한다", async () => {
    Object.assign(process.env, {
      MODAL_IMAGE_ENDPOINT: "",
      MODAL_PROXY_KEY: "",
      MODAL_PROXY_SECRET: "",
    });

    await expect(
      requestModalGeneration({ ...imageGenerationDefaults, prompt: "test" })
    ).rejects.toThrow(/MODAL 설정이 필요합니다/);
  });

  it("turbo 모델은 매핑된 값으로 요청을 전송한다", async () => {
    applyModalEnv();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: ["data:image/png;base64,aaa"] }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const payload = {
      ...imageGenerationDefaults,
      prompt: "hello",
      aspectRatio: "16:9" as const,
      resolution: 1024,
      model: "sdxl-turbo" as const,
      negativePrompt: "bad",
      steps: 30,
      cfgScale: 7,
      seed: "42",
      sampler: "Euler a",
    };

    await requestModalGeneration(payload);

    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(url).toBe("https://example.com/generate");
    expect(init?.headers).toMatchObject({
      "Content-Type": "application/json",
      "Modal-Key": "proxy-key",
      "Modal-Secret": "proxy-secret",
    });
    expect(body.prompt).toBe("hello");
    expect(body.width).toBe(1280);
    expect(body.height).toBe(720);
    expect(body.steps).toBe(2);
    expect(body.cfg_scale).toBe(0);
    expect(body.seed).toBeNull();
    expect(body.sampler).toBeNull();
    expect(body.negative_prompt).toBeNull();
  });

  it("일반 모델은 입력 값에 맞게 요청을 전송한다", async () => {
    applyModalEnv();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: ["data:image/png;base64,aaa"] }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const payload = {
      ...imageGenerationDefaults,
      prompt: "hello",
      aspectRatio: "4:3" as const,
      resolution: 1024,
      model: "sdxl-base-1.0" as const,
      negativePrompt: "bad",
      steps: 35,
      cfgScale: 8.5,
      seed: "7",
      sampler: "DDIM",
    };

    await requestModalGeneration(payload);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(body.width).toBe(1024);
    expect(body.height).toBe(768);
    expect(body.steps).toBe(35);
    expect(body.cfg_scale).toBe(8.5);
    expect(body.seed).toBe(7);
    expect(body.sampler).toBe("DDIM");
    expect(body.negative_prompt).toBe("bad");
  });

  it("init_images가 있으면 i2i 요청으로 전달한다", async () => {
    applyModalEnv();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: ["data:image/png;base64,aaa"] }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const payload = {
      ...imageGenerationDefaults,
      prompt: "hello",
      model: "z-image-turbo" as const,
      initImages: ["data:image/png;base64,xxx"],
    };

    await requestModalGeneration(payload);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(body.init_images).toEqual(["data:image/png;base64,xxx"]);
  });

  it("응답이 실패하면 상세 메시지를 전달한다", async () => {
    applyModalEnv();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "INVALID_REQUEST" }),
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestModalGeneration({ ...imageGenerationDefaults, prompt: "test" })
    ).rejects.toThrow("INVALID_REQUEST");
  });

  it("응답 파싱 실패 시 오류를 반환한다", async () => {
    applyModalEnv();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invalid: true }),
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestModalGeneration({ ...imageGenerationDefaults, prompt: "test" })
    ).rejects.toThrow("MODAL_RESPONSE_INVALID");
  });

  it("타임아웃이 발생하면 timeout 오류를 반환한다", async () => {
    applyModalEnv();
    vi.useFakeTimers();

    const fetchMock = vi.fn((_: RequestInfo, init?: RequestInit) => {
      return new Promise((_, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (signal) {
          signal.addEventListener("abort", () => {
            const error = new Error("aborted");
            (error as Error & { name: string }).name = "AbortError";
            reject(error);
          });
        }
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const promise = requestModalGeneration({
      ...imageGenerationDefaults,
      prompt: "test",
    });

    const expectation = expect(promise).rejects.toThrow("MODAL_REQUEST_TIMEOUT");

    await vi.advanceTimersByTimeAsync(120_001);

    await expectation;
    vi.useRealTimers();
  });
});
