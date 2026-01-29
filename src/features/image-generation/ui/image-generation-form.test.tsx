import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach } from "vitest";
import { ImageGenerationForm } from "@/features/image-generation/ui/image-generation-form";
import { renderWithIntl } from "@/test-utils/intl";
import { imageModels } from "@/features/image-generation/model/image-models";
import {
  runtimeImageModelsFixture,
  runtimeVideoModelsFixture,
} from "@/test-utils/fixtures/runtime-model-catalog";

const mockUseImageGeneration = vi.hoisted(() => vi.fn());

vi.mock("@/features/image-generation/hook/use-image-generation", () => ({
  useImageGeneration: mockUseImageGeneration,
}));

async function waitForModels() {
  await screen.findByRole("button", { name: /FLUX\.2 Klein 9B/i });
}

describe("ImageGenerationForm", () => {
  beforeEach(() => {
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
    expect(screen.queryByText("캔버스 비어 있음")).not.toBeInTheDocument();
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
    await waitForModels();

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

    const fluxButton = await screen.findByRole("button", {
      name: /FLUX\.2 Klein 9B/i,
    });
    await user.click(fluxButton);

    expect(await screen.findByText("모드")).toBeInTheDocument();
    expect(await screen.findByText("가이던스")).toBeInTheDocument();
    expect(await screen.findByText("프롬프트 업샘플링")).toBeInTheDocument();
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

    await user.click(
      screen.getByRole("button", { name: /FLUX\.2 Klein 9B/i }),
    );

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
