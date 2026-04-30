import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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

const qwenModeModelFixture: RuntimeAudioModel = {
  type: "audio",
  key: "qwen-tts-mode",
  label: "Qwen 3.5 TTS Mode",
  vendor: "HF Space",
  provider: "huggingface-space",
  providerConfig: {},
  parameters: {
    prompt: { ui: "textarea", required: true },
    modeChoice: {
      ui: "select",
      label: "Mode",
      options: [
        { label: "Voice Clone", value: "voice_clone" },
        { label: "Custom Speaker", value: "custom" },
        { label: "Voice Design", value: "voice_design" },
      ],
      default: "voice_clone",
    },
    language: {
      ui: "select",
      label: "Language",
      options: [
        { label: "English", value: "English" },
        { label: "Korean", value: "Korean" },
      ],
      default: "English",
    },
    speaker: {
      ui: "select",
      label: "Speaker",
      options: [
        { label: "Vivian - Chinese - Bright young female", value: "Vivian" },
        { label: "Serena - Chinese - Warm gentle female", value: "Serena" },
      ],
      default: "Vivian",
    },
    streamMode: {
      ui: "toggle",
      label: "Live output",
      default: true,
    },
    inputAudio: {
      ui: "upload",
      label: "Sample audio",
      required: true,
    },
    referenceText: {
      ui: "textarea",
      label: "Reference Transcript",
      required: true,
    },
    customInstruction: {
      ui: "textarea",
      label: "Notes",
    },
    voiceInstruction: {
      ui: "textarea",
      label: "Voice style",
    },
    temperature: {
      ui: "range",
      label: "Temperature",
      min: 0.1,
      max: 1.2,
      step: 0.1,
      default: 0.7,
    },
    topK: {
      ui: "range",
      label: "Clarity",
      min: 1,
      max: 100,
      step: 1,
      default: 20,
    },
    repetitionPenalty: {
      ui: "range",
      label: "Repetition",
      min: 1,
      max: 2,
      step: 0.1,
      default: 1.1,
    },
    seed: {
      ui: "text",
    },
  },
  meta: {
    supports_input_audio: true,
  },
  isActive: true,
  isDefault: true,
};

async function waitForModels() {
  await screen.findByRole("button", { name: /Qwen 3\.5 TTS/i });
}

async function openModelPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /Qwen 3\.5 TTS|Bark TTS/i }),
  );
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

  it("does not render the old preset strip and still submits through the dock", async () => {
    const startGeneration = vi.fn();
    mockUseAudioGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration,
      reset: vi.fn(),
    });

    const user = userEvent.setup();

    renderWithIntl(<AudioGenerationForm isAuthenticated />);
    await waitForModels();

    expect(
      screen.queryByRole("button", { name: /따뜻한 보이스오버/ }),
    ).toBeNull();
    await user.type(
      within(screen.getByRole("region", { name: "작업 입력" })).getByRole(
        "textbox",
      ),
      "A calm, warm voiceover introducing a creative AI studio.",
    );

    await user.click(screen.getByRole("button", { name: "생성" }));

    expect(startGeneration).toHaveBeenCalledTimes(1);
    expect(startGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "A calm, warm voiceover introducing a creative AI studio.",
        model: "qwen-tts",
      }),
    );
  });

  it("renders the shared creation input with audio-specific control chips", async () => {
    mockUseAudioGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration: vi.fn(),
      reset: vi.fn(),
    });

    renderWithIntl(<AudioGenerationForm isAuthenticated />);
    await waitForModels();

    const dock = screen.getByRole("region", {
      name: "작업 입력",
    });

    expect(dock).toHaveAttribute("data-app-prompt-field");
    expect(screen.getByTestId("shared-prompt-form-surface")).toHaveAttribute(
      "data-variant",
      "prompt",
    );
    expect(screen.getByTestId("shared-prompt-form-surface")).toHaveClass(
      "bg-black/18",
    );
    expect(dock).toHaveTextContent("설정");
    expect(dock).toHaveTextContent("1x");
    expect(within(dock).queryByRole("slider")).toBeNull();
    expect(within(dock).queryByLabelText("Sample audio")).toBeNull();
    expect(
      screen.getByRole("button", { name: /Qwen 3\.5 TTS/i }),
    ).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.getByRole("button", { name: "생성" })).toBeInTheDocument();
  });

  it("renders a text-first audio studio preview without mock media cards", async () => {
    mockUseAudioGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration: vi.fn(),
      reset: vi.fn(),
    });

    renderWithIntl(<AudioGenerationForm isAuthenticated />);
    await waitForModels();

    expect(screen.getByText("AUDIO STUDIO")).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "Shape sound with control." }),
    ).not.toBeNull();
    expect(
      screen.getByText("Describe the sound you need. Fine-tune the settings. Generate production-ready audio."),
    ).not.toBeNull();
    const resultFrame = screen.getByTestId("generation-canvas");
    expect(resultFrame).toHaveClass("rounded-[1.75rem]");
    expect(resultFrame).toHaveClass("max-w-6xl");
    expect(resultFrame).not.toHaveClass("bg-[#07090a]");
    expect(
      screen.getByRole("heading", { name: "Shape sound with control." }).closest(
        "[data-testid='generation-canvas']",
      ),
    ).toBeNull();
    expect(screen.queryByAltText("오디오 콘솔 사진")).toBeNull();
    expect(screen.queryByText("VOICE TAKE")).toBeNull();
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
    const openLink = container.querySelector('a[title="열기"]');
    const downloadLink = container.querySelector('a[title="다운로드"]');

    expect(openLink?.getAttribute("href")).toBe("https://example.com/generated.mp3");
    expect(downloadLink?.getAttribute("href")).toBe(
      "/api/audio-generation/request-id/download?index=0",
    );
  });

  it("requestId가 없으면 다운로드 링크를 직접 자산 URL로 노출하지 않는다", async () => {
    mockUseAudioGeneration.mockReturnValue({
      state: {
        status: "completed",
        progress: 100,
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

    expect(container.querySelector('a[title="열기"]')).not.toBeNull();
    expect(container.querySelector('a[title="다운로드"]')).toBeNull();
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
      await screen.findByText("로그인하면 바로 만들 수 있습니다."),
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
      within(screen.getByRole("region", { name: "작업 입력" })).getByRole(
        "textbox",
      ),
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

    await openModelPicker(user);
    await user.click(await screen.findByRole("button", { name: /Bark TTS/i }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("reference 입력을 지원하는 모델이면 오디오 업로드와 reference text를 함께 제출한다", async () => {
    const startGeneration = vi.fn();
    mockUseAudioGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration,
      reset: vi.fn(),
    });

    const cloneModel: RuntimeAudioModel = {
      ...runtimeAudioModelsFixture[0],
      key: "qwen-tts-clone",
      label: "Qwen TTS Clone",
      parameters: {
        ...runtimeAudioModelsFixture[0].parameters,
        inputAudio: { ui: "upload", required: true },
        referenceText: { ui: "textarea", required: true },
      },
      meta: {
        supports_input_audio: true,
      },
      isDefault: true,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ items: [cloneModel] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const fileReaderResult = "data:audio/wav;base64,UklGRg==";
    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      onload: null | (() => void) = null;
      readAsDataURL() {
        this.result = fileReaderResult;
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", MockFileReader as unknown as typeof FileReader);

    const user = userEvent.setup();
    renderWithIntl(<AudioGenerationForm isAuthenticated />);
    await screen.findByRole("button", { name: /Qwen TTS Clone/i });

    await user.type(
      within(screen.getByRole("region", { name: "작업 입력" })).getByRole(
        "textbox",
      ),
      "hello clone",
    );
    await user.click(screen.getByRole("button", { name: /설정/i }));
    await user.upload(
      await screen.findByLabelText("Sample audio"),
      new File([Uint8Array.from([82, 73, 70, 70])], "ref.wav", {
        type: "audio/wav",
      }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "샘플 문장" }),
      "reference words",
    );
    await user.click(screen.getByRole("button", { name: "생성" }));

    await waitFor(() => {
      expect(startGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "hello clone",
          inputAudio: fileReaderResult,
          referenceText: "reference words",
        }),
      );
    });
  });

  it("mode 기반 TTS 모델이면 speaker/language/advanced 필드를 렌더링하고 기본값을 제출한다", async () => {
    const startGeneration = vi.fn();
    mockUseAudioGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration,
      reset: vi.fn(),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ items: [qwenModeModelFixture] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const fileReaderResult = "data:audio/wav;base64,UklGRg==";
    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      onload: null | (() => void) = null;
      readAsDataURL() {
        this.result = fileReaderResult;
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", MockFileReader as unknown as typeof FileReader);

    const user = userEvent.setup();
    renderWithIntl(<AudioGenerationForm isAuthenticated />);
    await screen.findByRole("button", { name: /Qwen 3\.5 TTS Mode/i });
    await user.click(screen.getByRole("button", { name: /설정/i }));

    expect(screen.getAllByText("Mode").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Language").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Speaker").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("combobox", { name: "Speaker" }),
    ).toHaveTextContent("Vivian - Chinese - Bright young female");
    expect(screen.getByText("추가 조정")).not.toBeNull();
    expect(screen.queryByText("Temperature")).not.toBeInTheDocument();
    expect(screen.queryByText("Top K")).not.toBeInTheDocument();
    expect(screen.queryByText("Repetition Penalty")).not.toBeInTheDocument();

    fireEvent.change(
      within(screen.getByRole("region", { name: "작업 입력" })).getByRole(
        "textbox",
      ),
      { target: { value: "hello qwen" } },
    );
    await user.upload(
      screen.getByLabelText("Sample audio"),
      new File([Uint8Array.from([82, 73, 70, 70])], "ref.wav", {
        type: "audio/wav",
      }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "샘플 문장" }),
      { target: { value: "reference transcript" } },
    );
    await user.click(screen.getByRole("button", { name: "생성" }));

    await waitFor(() => {
      expect(startGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "hello qwen",
          voice: "",
          modeChoice: "voice_clone",
          language: "English",
          speaker: "Vivian",
          streamMode: true,
          temperature: 0.7,
          topK: 20,
          repetitionPenalty: 1.1,
          inputAudio: fileReaderResult,
          referenceText: "reference transcript",
        }),
      );
    });
  }, 15_000);
});
