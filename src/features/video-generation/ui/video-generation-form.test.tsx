import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoGenerationForm } from "@/features/video-generation/ui/video-generation-form";
import { videoGenerationDefaults } from "@/features/video-generation/model/video-generation-schema";
import { renderWithIntl } from "@/test-utils/intl";
import {
  runtimeImageModelsFixture,
  runtimeVideoModelsFixture,
} from "@/test-utils/fixtures/runtime-model-catalog";

const navigationMocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => navigationMocks.searchParams,
}));

const startGenerationMock = vi.fn();
const resetMock = vi.fn();

vi.mock("@/features/video-generation/hook/use-video-generation", () => ({
  useVideoGeneration: () => ({
    state: {
      status: "idle",
      progress: 0,
      requestId: undefined,
      errorMessage: undefined,
      result: undefined,
    },
    startGeneration: startGenerationMock,
    reset: resetMock,
  }),
}));

async function waitForModels() {
  await screen.findByText("Wan 2.2 (HF Space)");
}

async function openModelPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /Wan 2\.2/i }));
}

describe("VideoGenerationForm", () => {
  beforeEach(() => {
    navigationMocks.searchParams = new URLSearchParams();
    startGenerationMock.mockClear();
    resetMock.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            items: [...runtimeImageModelsFixture, ...runtimeVideoModelsFixture],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );
    class MockFileReader {
      result: string | null = null;
      onload: null | (() => void) = null;

      readAsDataURL() {
        this.result = "data:image/png;base64,AAAA";
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", MockFileReader);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("쿼리 파라미터로 prompt/model/initImage를 초기화한다", async () => {
    navigationMocks.searchParams = new URLSearchParams();
    navigationMocks.searchParams.set("prompt", "query prompt");
    navigationMocks.searchParams.set("model", "wan2-2-hf");
    navigationMocks.searchParams.set("initImage", "https://example.com/init.png");

    renderWithIntl(<VideoGenerationForm isAuthenticated />);
    await waitForModels();

    expect(screen.getByDisplayValue("query prompt")).toBeInTheDocument();
    expect(
      await screen.findByAltText("입력 이미지 미리보기"),
    ).toBeInTheDocument();

    const modelButton = screen.getByRole("button", {
      name: /Wan 2\.2/i,
    });
    expect(modelButton).toHaveClass("border-primary");
  });

  it("renders model selection cards", async () => {
    renderWithIntl(<VideoGenerationForm isAuthenticated />);

    expect(await screen.findByText("Wan 2.2 (HF Space)")).toBeInTheDocument();
  });

  it("renders the shared creation input with video-specific control chips", async () => {
    renderWithIntl(<VideoGenerationForm isAuthenticated />);
    await waitForModels();

    const dock = screen.getByRole("region", {
      name: "작업 입력",
    });

    expect(dock).toHaveClass("lf-editorial-panel");
    expect(screen.getByTestId("shared-prompt-form-surface")).toHaveClass(
      "bg-black/18",
    );
    expect(dock).toHaveTextContent("이미지 필요");
    expect(dock).toHaveTextContent("3.5s");
    expect(within(dock).queryByRole("slider")).toBeNull();
    expect(
      screen.getByRole("button", { name: /Wan 2\.2/i }),
    ).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.getByRole("button", { name: "생성" })).toBeInTheDocument();
  });

  it("does not render the old preset strip and still submits through the dock", async () => {
    const { container } = renderWithIntl(<VideoGenerationForm isAuthenticated />);
    const user = userEvent.setup();

    await waitForModels();
    expect(screen.queryByRole("button", { name: /제품 오빗/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Wan 2\.2/i })).toHaveClass(
      "border-primary",
    );

    const submit = screen.getByRole("button", { name: "생성" });
    const fileInput = container.querySelector(
      "input[type=\"file\"]",
    ) as HTMLInputElement | null;

    expect(submit).toBeDisabled();
    expect(fileInput).not.toBeNull();

    const prompt = within(
      screen.getByRole("region", { name: "작업 입력" }),
    ).getByRole("textbox");
    await user.type(prompt, "slow orbit camera move around a premium product");
    if (fileInput) {
      const file = new File(["test"], "sample.png", { type: "image/png" });
      await user.upload(fileInput, file);
    }

    await screen.findByAltText("입력 이미지 미리보기");
    expect(submit).not.toBeDisabled();

    await user.click(submit);

    expect(startGenerationMock).toHaveBeenCalledTimes(1);
    expect(startGenerationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "slow orbit camera move around a premium product",
        model: "wan2-2-hf",
        initImage: "data:image/png;base64,AAAA",
      }),
    );
  });

  it("모달리티 배지를 표시한다", async () => {
    renderWithIntl(<VideoGenerationForm isAuthenticated />);
    await waitForModels();

    await openModelPicker(userEvent.setup());
    expect(await screen.findByText("T2V")).toBeInTheDocument();
    expect(await screen.findByText("I2V")).toBeInTheDocument();
  });

  it("submits prompt and default settings", async () => {
    const { container } = renderWithIntl(<VideoGenerationForm isAuthenticated />);
    const user = userEvent.setup();
    await waitForModels();

    const prompt = within(
      screen.getByRole("region", { name: "작업 입력" }),
    ).getByRole("textbox");
    const submit = screen.getByRole("button", { name: "생성" });
    const fileInput = container.querySelector(
      "input[type=\"file\"]",
    ) as HTMLInputElement | null;

    expect(submit).toBeDisabled();
    expect(prompt).toBeInTheDocument();
    expect(fileInput).not.toBeNull();

    await user.type(prompt, "cinematic sunrise");
    if (fileInput) {
      const file = new File(["test"], "sample.png", { type: "image/png" });
      await user.upload(fileInput, file);
    }

    await screen.findByAltText("입력 이미지 미리보기");
    expect(submit).not.toBeDisabled();
    await user.click(submit);

    expect(startGenerationMock).toHaveBeenCalledTimes(1);
    expect(startGenerationMock).toHaveBeenCalledWith({
      ...videoGenerationDefaults,
      initImage: "data:image/png;base64,AAAA",
      prompt: "cinematic sunrise",
    });
  });

  it("exposes upload trigger", async () => {
    renderWithIntl(<VideoGenerationForm isAuthenticated />);
    await waitForModels();

    const uploadButton = screen.getByLabelText("레퍼런스 이미지 업로드");

    expect(uploadButton).toBeInTheDocument();
  });

  it("비로그인 상태에서 로그인 게이트를 표시한다", async () => {
    renderWithIntl(<VideoGenerationForm isAuthenticated={false} />);

    expect(
      await screen.findByText("로그인하면 바로 만들 수 있습니다."),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "생성" }));

    expect(
      await screen.findByText("로그인이 필요합니다"),
    ).toBeInTheDocument();
    expect(startGenerationMock).not.toHaveBeenCalled();
  });
});
