import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach } from "vitest";
import { ImageGenerationForm } from "@/features/image-generation/ui/image-generation-form";
import { renderWithIntl } from "@/test-utils/intl";
import { imageModels } from "@/features/image-generation/model/image-models";
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

const mockUseImageGeneration = vi.hoisted(() => vi.fn());

vi.mock("@/features/image-generation/hook/use-image-generation", () => ({
  useImageGeneration: mockUseImageGeneration,
}));

async function waitForModels() {
  await screen.findByRole("button", {
    name: /Z-Image Turbo|FLUX\.2 Klein 9B/i,
  });
}

async function openModelPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", {
      name: /Z-Image Turbo|FLUX\.2 Klein 9B|GPT Image 2/i,
    }),
  );
}

describe("ImageGenerationForm", () => {
  beforeEach(() => {
    navigationMocks.searchParams = new URLSearchParams();
    mockUseImageGeneration.mockReset();
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("쿼리 파라미터로 prompt/model/initImage를 초기화한다", async () => {
    const startGeneration = vi.fn();
    const reset = vi.fn();

    mockUseImageGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration,
      reset,
    });

    navigationMocks.searchParams = new URLSearchParams();
    navigationMocks.searchParams.set("prompt", "a query prompt");
    navigationMocks.searchParams.set("model", "flux2-klein-9b");
    navigationMocks.searchParams.append("initImage", "https://example.com/one.png");
    navigationMocks.searchParams.append("initImage", "https://example.com/two.png");

    renderWithIntl(<ImageGenerationForm isAuthenticated />);
    await waitForModels();

    expect(
      screen.getByDisplayValue("a query prompt"),
    ).toBeInTheDocument();
    expect(await screen.findAllByAltText("입력 이미지 미리보기")).toHaveLength(2);

    const modelButton = screen.getByRole("button", {
      name: /FLUX\.2 Klein 9B/i,
    });
    expect(modelButton).toHaveClass("border-primary");
  });

  it("renders a bottom creation input with model and actual settings controls", async () => {
    mockUseImageGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration: vi.fn(),
      reset: vi.fn(),
    });

    renderWithIntl(<ImageGenerationForm isAuthenticated />);
    await waitForModels();

    const dock = screen.getByRole("region", {
      name: "작업 입력",
    });

    expect(dock).toHaveAttribute("data-app-prompt-field");
    expect(screen.getByTestId("shared-prompt-form-surface")).toHaveAttribute(
      "data-variant",
      "prompt",
    );
    expect(dock.className).toContain("bg-[#0b0d0e]");
    expect(dock.className).not.toContain("gradient");
    expect(screen.getByTestId("shared-prompt-form-surface")).toHaveClass(
      "bg-black/18",
    );
    expect(screen.getByTestId("shared-prompt-meta")).toHaveTextContent("0자");
    expect(dock).toHaveTextContent("모델 선택");
    expect(dock).not.toHaveTextContent("1:1");
    expect(dock).not.toHaveTextContent("1K");
    expect(dock).not.toHaveTextContent("Draw");
    expect(dock).toHaveTextContent("출력 크기");
    expect(dock).toHaveTextContent("이미지 수");
    expect(within(dock).queryByRole("spinbutton", { name: "너비" })).toBeNull();
    expect(within(dock).queryByRole("spinbutton", { name: "높이" })).toBeNull();
    expect(screen.queryByText("준비 완료")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Z-Image Turbo|FLUX\.2 Klein 9B/i }),
    ).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.getByRole("button", { name: "생성" })).toBeInTheDocument();
  });

  it("renders a text-first image studio preview without mock media cards", async () => {
    mockUseImageGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration: vi.fn(),
      reset: vi.fn(),
    });

    renderWithIntl(<ImageGenerationForm isAuthenticated />);
    await waitForModels();

    expect(screen.getByText("IMAGE STUDIO")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Create images with control." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Describe your idea. Choose your settings. Generate with precision."),
    ).toBeInTheDocument();
    const resultFrame = screen.getByTestId("generation-canvas");
    expect(resultFrame).toHaveClass("rounded-[1.75rem]");
    expect(resultFrame).toHaveClass("max-w-6xl");
    expect(resultFrame).not.toHaveClass("bg-[#07090a]");
    expect(
      screen.getByRole("heading", { name: "Create images with control." }).closest(
        "[data-testid='generation-canvas']",
      ),
    ).toBeNull();
    expect(screen.queryByAltText("어두운 톤의 인물 레퍼런스")).not.toBeInTheDocument();
    expect(screen.queryByText("VISUAL TAKE")).not.toBeInTheDocument();
  });

  it("등록 모델이 없으면 상단 alert 대신 dock 모델 영역에 상태를 표시한다", async () => {
    mockUseImageGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration: vi.fn(),
      reset: vi.fn(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    renderWithIntl(<ImageGenerationForm isAuthenticated />);

    expect(await screen.findByText("선택 가능한 모델 없음")).toBeInTheDocument();
    expect(
      screen.queryByText("지금 사용할 수 있는 생성 모델이 없습니다."),
    ).not.toBeInTheDocument();
  });

  it("필수 입력값이 비어 있으면 오류 메시지를 표시한다", async () => {
    const startGeneration = vi.fn();
    const reset = vi.fn();

    mockUseImageGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration,
      reset,
    });

    const user = userEvent.setup();

    renderWithIntl(<ImageGenerationForm isAuthenticated />);
    await waitForModels();

    await user.click(screen.getByRole("button", { name: "생성" }));

    expect(
      await screen.findByText("프롬프트를 입력해주세요."),
    ).toBeInTheDocument();
    expect(startGeneration).not.toHaveBeenCalled();
  });

  it("생성 중 상태를 표시한다", () => {
    mockUseImageGeneration.mockReturnValue({
      state: {
        status: "processing",
        progress: 42,
        requestId: "request-id",
      },
      startGeneration: vi.fn(),
      reset: vi.fn(),
    });

    renderWithIntl(<ImageGenerationForm isAuthenticated />);

    expect(screen.queryByText("42%")).not.toBeInTheDocument();
    expect(screen.getAllByText("생성 중...").length).toBeGreaterThan(0);
  });

  it("완료된 결과 이미지를 표시한다", () => {
    mockUseImageGeneration.mockReturnValue({
      state: {
        status: "completed",
        progress: 100,
        requestId: "request-id",
        result: {
          images: [{ url: "https://example.com/generated.png" }],
        },
      },
      startGeneration: vi.fn(),
      reset: vi.fn(),
    });

    renderWithIntl(<ImageGenerationForm isAuthenticated />);

    expect(screen.getByAltText("생성된 이미지 1")).toBeInTheDocument();
    expect(screen.queryByText("준비 완료")).not.toBeInTheDocument();
    expect(screen.queryByText("생성 중...")).not.toBeInTheDocument();
  });

  it("비로그인 상태에서 로그인 게이트를 표시한다", async () => {
    const startGeneration = vi.fn();
    const reset = vi.fn();

    mockUseImageGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration,
      reset,
    });

    const user = userEvent.setup();

    renderWithIntl(<ImageGenerationForm isAuthenticated={false} />);

    expect(
      await screen.findByText("로그인하면 바로 만들 수 있습니다."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "생성" }));

    expect(
      await screen.findByText("로그인이 필요합니다"),
    ).toBeInTheDocument();
    expect(startGeneration).not.toHaveBeenCalled();
  });

  it("FLUX 모델에서 모드/가이던스/업샘플링 옵션을 노출한다", async () => {
    const fluxModel = imageModels.find((model) => model.key === "flux2-klein-9b");
    expect(fluxModel).toBeDefined();
    if (!fluxModel) return;

    mockUseImageGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration: vi.fn(),
      reset: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithIntl(<ImageGenerationForm isAuthenticated />);

    await openModelPicker(user);
    await user.click(
      await screen.findByRole("button", { name: /FLUX\.2 Klein 9B/i }),
    );
    await user.click(await screen.findByRole("button", { name: /설정/i }));

    expect(await screen.findByText("모드")).toBeInTheDocument();
    expect(await screen.findByText("가이던스")).toBeInTheDocument();
    expect(await screen.findByText("프롬프트 보강")).toBeInTheDocument();
  });

  it("GPT Image 2 모델들에서는 설정 패널을 노출하지 않는다", async () => {
    mockUseImageGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration: vi.fn(),
      reset: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithIntl(<ImageGenerationForm isAuthenticated />);
    await waitForModels();

    for (const label of ["GPT Image 2", "GPT Image 2 Bridge"]) {
      await openModelPicker(user);
      const modelLabel = await screen.findByText(label);
      const gptButton = modelLabel.closest("button");
      expect(gptButton).not.toBeNull();
      await user.click(gptButton as HTMLButtonElement);

      await waitFor(() => {
        expect(
          screen.queryByRole("heading", { name: "설정" }),
        ).not.toBeInTheDocument();
      });
    }
  });

  it("모델 카드에서 기술 배지와 설명을 제거하고 기본 모델만 표시한다", async () => {
    mockUseImageGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration: vi.fn(),
      reset: vi.fn(),
    });

    renderWithIntl(<ImageGenerationForm isAuthenticated />);
    await waitForModels();

    await openModelPicker(userEvent.setup());
    expect(screen.getByText("default")).toBeInTheDocument();
    expect(screen.queryByText("T2I")).not.toBeInTheDocument();
    expect(screen.queryByText("I2I")).not.toBeInTheDocument();
    expect(screen.queryByText("기술 정보")).not.toBeInTheDocument();
  });

  it("모델 전환 시 생성 폴링을 리셋한다", async () => {
    const reset = vi.fn();
    mockUseImageGeneration.mockReturnValue({
      state: {
        status: "processing",
        progress: 0,
        requestId: "request-id",
      },
      startGeneration: vi.fn(),
      reset,
    });

    const user = userEvent.setup();
    renderWithIntl(<ImageGenerationForm isAuthenticated />);
    await waitForModels();

    await openModelPicker(user);
    await user.click(
      await screen.findByRole("button", { name: /FLUX\.2 Klein 9B/i }),
    );

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
