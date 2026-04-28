import { screen } from "@testing-library/react";
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

  it("preset 선택 시 prompt와 추천 모델을 form state에 반영한다", async () => {
    const { container } = renderWithIntl(<VideoGenerationForm isAuthenticated />);
    const user = userEvent.setup();

    await waitForModels();

    await user.click(screen.getByRole("button", { name: /제품 오빗/ }));

    expect(
      screen.getByDisplayValue(
        "slow orbit camera move around a premium product, soft reflections, controlled studio light",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Wan 2\.2/i })).toHaveClass(
      "border-primary",
    );

    const submit = screen.getByRole("button", { name: "생성" });
    const fileInput = container.querySelector(
      "input[type=\"file\"]",
    ) as HTMLInputElement | null;

    expect(submit).toBeDisabled();
    expect(fileInput).not.toBeNull();

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
        prompt:
          "slow orbit camera move around a premium product, soft reflections, controlled studio light",
        model: "wan2-2-hf",
        initImage: "data:image/png;base64,AAAA",
      }),
    );
  });

  it("모달리티 배지를 표시한다", async () => {
    renderWithIntl(<VideoGenerationForm isAuthenticated />);
    await waitForModels();

    expect(await screen.findByText("T2V")).toBeInTheDocument();
    expect(await screen.findByText("I2V")).toBeInTheDocument();
  });

  it("submits prompt and default settings", async () => {
    const { container } = renderWithIntl(<VideoGenerationForm isAuthenticated />);
    const user = userEvent.setup();
    await waitForModels();

    const prompt = screen.getByPlaceholderText(
      "생성할 비디오를 자세히 설명하세요...",
    );
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
      await screen.findByText("로그인하여 모델 목록을 확인하세요."),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "생성" }));

    expect(
      await screen.findByText("로그인이 필요합니다"),
    ).toBeInTheDocument();
    expect(startGenerationMock).not.toHaveBeenCalled();
  });
});
