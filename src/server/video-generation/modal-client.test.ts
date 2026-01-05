import { requestModalVideoGeneration } from "@/server/video-generation/modal-client";
import {
  videoGenerationDefaults,
  type VideoResolution,
} from "@/features/video-generation/model/video-generation-schema";

const baseEnv = {
  MODAL_VIDEO_ENDPOINT: process.env.MODAL_VIDEO_ENDPOINT,
  MODAL_PROXY_KEY: process.env.MODAL_PROXY_KEY,
  MODAL_PROXY_SECRET: process.env.MODAL_PROXY_SECRET,
  MODAL_TIMEOUT_MS: process.env.MODAL_TIMEOUT_MS,
};

describe("requestModalVideoGeneration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.assign(process.env, baseEnv);
  });

  const applyModalEnv = () => {
    Object.assign(process.env, {
      MODAL_VIDEO_ENDPOINT: "https://example.com/generate-video",
      MODAL_PROXY_KEY: "proxy-key",
      MODAL_PROXY_SECRET: "proxy-secret",
      MODAL_TIMEOUT_MS: "120000",
    });
  };

  it("필수 환경 변수가 없으면 오류를 반환한다", async () => {
    Object.assign(process.env, {
      MODAL_VIDEO_ENDPOINT: "",
      MODAL_PROXY_KEY: "",
      MODAL_PROXY_SECRET: "",
    });

    await expect(
      requestModalVideoGeneration({
        ...videoGenerationDefaults,
        prompt: "test",
      })
    ).rejects.toThrow(/MODAL 설정이 필요합니다/);
  });

  it("입력값을 Modal 요청 스키마로 매핑한다", async () => {
    applyModalEnv();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ videos: ["data:video/mp4;base64,aaa"] }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const payload = {
      ...videoGenerationDefaults,
      prompt: "hello",
      aspectRatio: "9:16" as const,
      resolution: 1080 as VideoResolution,
      durationSec: 6,
      fps: 24,
      steps: 40,
      guidanceScale: 7,
      seed: "42",
      initImage: "data:image/png;base64,xxx",
    };

    await requestModalVideoGeneration(payload);

    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(url).toBe("https://example.com/generate-video");
    expect(init?.headers).toMatchObject({
      "Content-Type": "application/json",
      "Modal-Key": "proxy-key",
      "Modal-Secret": "proxy-secret",
    });
    expect(body.prompt).toBe("hello");
    expect(body.width).toBe(1080);
    expect(body.height).toBe(1920);
    expect(body.duration_sec).toBe(6);
    expect(body.fps).toBe(24);
    expect(body.steps).toBe(40);
    expect(body.guidance_scale).toBe(7);
    expect(body.seed).toBe(42);
    expect(body.init_image).toBe("data:image/png;base64,xxx");
  });

  it("init image가 없으면 null로 전달한다", async () => {
    applyModalEnv();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ videos: ["data:video/mp4;base64,aaa"] }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const payload = {
      ...videoGenerationDefaults,
      prompt: "hello",
      initImage: "",
    };

    await requestModalVideoGeneration(payload);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(body.init_image).toBeNull();
  });

  it("응답이 실패하면 상세 메시지를 전달한다", async () => {
    applyModalEnv();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "INVALID_REQUEST" }),
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestModalVideoGeneration({
        ...videoGenerationDefaults,
        prompt: "test",
      })
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
      requestModalVideoGeneration({
        ...videoGenerationDefaults,
        prompt: "test",
      })
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

    const promise = requestModalVideoGeneration({
      ...videoGenerationDefaults,
      prompt: "test",
    });

    const expectation = expect(promise).rejects.toThrow("MODAL_REQUEST_TIMEOUT");

    await vi.advanceTimersByTimeAsync(120_001);

    await expectation;
    vi.useRealTimers();
  });
});
