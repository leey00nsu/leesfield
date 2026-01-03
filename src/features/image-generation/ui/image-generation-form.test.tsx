import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageGenerationForm } from "@/features/image-generation/ui/image-generation-form";

const mockUseImageGeneration = vi.hoisted(() => vi.fn());

vi.mock("@/features/image-generation/hook/use-image-generation", () => ({
  useImageGeneration: mockUseImageGeneration,
}));

describe("ImageGenerationForm", () => {
  beforeEach(() => {
    mockUseImageGeneration.mockReset();
  });

  it("필수 입력값이 비어 있으면 오류 메시지를 표시한다", async () => {
    const startGeneration = vi.fn();

    mockUseImageGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration,
    });

    const user = userEvent.setup();

    render(<ImageGenerationForm />);

    await user.click(screen.getByRole("button", { name: /generate/i }));

    expect(
      await screen.findByText("프롬프트를 입력해주세요."),
    ).toBeInTheDocument();
    expect(startGeneration).not.toHaveBeenCalled();
  });

  it("생성 중 상태와 진행률을 표시한다", () => {
    mockUseImageGeneration.mockReturnValue({
      state: {
        status: "processing",
        progress: 42,
        requestId: "request-id",
      },
      startGeneration: vi.fn(),
    });

    render(<ImageGenerationForm />);

    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText(/Generating.../i)).toBeInTheDocument();
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
    });

    render(<ImageGenerationForm />);

    expect(screen.getByAltText("Generated image 1")).toBeInTheDocument();
    expect(screen.queryByText("Canvas Empty")).not.toBeInTheDocument();
    expect(screen.queryByText(/Generating.../i)).not.toBeInTheDocument();
  });
});
