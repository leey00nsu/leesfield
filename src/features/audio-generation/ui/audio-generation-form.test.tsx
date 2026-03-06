import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { AudioGenerationForm } from "@/features/audio-generation/ui/audio-generation-form";
import { renderWithIntl } from "@/test-utils/intl";
import type { RuntimeAudioModel } from "@/shared/model-catalog/runtime-utils";

const navigationMocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => navigationMocks.searchParams,
}));

const mockUseAudioGeneration = vi.hoisted(() => vi.fn());

vi.mock("@/features/audio-generation/hook/use-audio-generation", () => ({
  useAudioGeneration: mockUseAudioGeneration,
}));

const runtimeAudioModelsFixture: RuntimeAudioModel[] = [
  {
    type: "audio",
    key: "qwen-tts",
    label: "Qwen 3.5 TTS",
    vendor: "HF Space",
    provider: "huggingface-space",
    providerConfig: {},
    parameters: {
      voice: {
        default: "alloy",
      },
      speed: {
        min: 0.25,
        max: 4,
        step: 0.05,
        default: 1,
      },
      seed: {
        ui: "text",
      },
    },
    meta: {
      supports_input_audio: false,
    },
    isActive: true,
    isDefault: true,
  },
];

async function waitForModels() {
  await screen.findByRole("button", { name: /Qwen 3\.5 TTS/i });
}

describe("AudioGenerationForm", () => {
  beforeEach(() => {
    navigationMocks.searchParams = new URLSearchParams();
    mockUseAudioGeneration.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ items: runtimeAudioModelsFixture }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("쿼리 파라미터로 prompt/model을 초기화한다", async () => {
    mockUseAudioGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration: vi.fn(),
      reset: vi.fn(),
    });

    navigationMocks.searchParams = new URLSearchParams();
    navigationMocks.searchParams.set("prompt", "say hello");
    navigationMocks.searchParams.set("model", "qwen-tts");

    renderWithIntl(<AudioGenerationForm isAuthenticated />);
    await waitForModels();

    expect(screen.getByDisplayValue("say hello")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /Qwen 3\.5 TTS/i }),
    ).not.toBeNull();
  });

  it("완료된 결과 오디오 플레이어와 액션을 표시한다", async () => {
    mockUseAudioGeneration.mockReturnValue({
      state: {
        status: "completed",
        progress: 100,
        requestId: "request-id",
        result: {
          audios: [
            {
              url: "https://example.com/generated.mp3",
              durationSec: 7,
            },
          ],
        },
      },
      startGeneration: vi.fn(),
      reset: vi.fn(),
    });

    const { container } = renderWithIntl(
      <AudioGenerationForm isAuthenticated />,
    );
    await waitForModels();

    expect(container.querySelector("audio")).not.toBeNull();
    expect(screen.getByText(/#1/i)).not.toBeNull();
    expect(
      container.querySelector('a[href="https://example.com/generated.mp3"]'),
    ).not.toBeNull();
  });

  it("비로그인 상태에서 로그인 게이트를 표시한다", async () => {
    mockUseAudioGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration: vi.fn(),
      reset: vi.fn(),
    });

    const user = userEvent.setup();

    renderWithIntl(<AudioGenerationForm isAuthenticated={false} />);

    expect(
      await screen.findByText("로그인하여 모델 목록을 확인하세요."),
    ).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "생성" }));

    expect(await screen.findByText("로그인이 필요합니다")).not.toBeNull();
  });

  it("정상 입력이면 생성 요청을 시작한다", async () => {
    const startGeneration = vi.fn();
    mockUseAudioGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration,
      reset: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithIntl(<AudioGenerationForm isAuthenticated />);
    await waitForModels();

    await user.type(
      screen.getByPlaceholderText("생성할 음성 내용을 자연스럽게 입력하세요..."),
      "hello audio",
    );
    await user.click(screen.getByRole("button", { name: "생성" }));

    expect(startGeneration).toHaveBeenCalledTimes(1);
    expect(startGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "hello audio",
        model: "qwen-tts",
        voice: "alloy",
        speed: 1,
      }),
    );
  });

  it("모델 전환 시 생성 폴링을 리셋한다", async () => {
    const reset = vi.fn();
    mockUseAudioGeneration.mockReturnValue({
      state: {
        status: "processing",
        progress: 0,
        requestId: "request-id",
      },
      startGeneration: vi.fn(),
      reset,
    });

    const secondModel: RuntimeAudioModel = {
      ...runtimeAudioModelsFixture[0],
      key: "bark-tts",
      label: "Bark TTS",
      isDefault: false,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ items: [...runtimeAudioModelsFixture, secondModel] }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithIntl(<AudioGenerationForm isAuthenticated />);
    await waitForModels();

    await user.click(screen.getByRole("button", { name: /Bark TTS/i }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
