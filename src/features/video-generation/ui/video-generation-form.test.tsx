import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VideoGenerationForm } from "@/features/video-generation/ui/video-generation-form";
import { videoGenerationDefaults } from "@/features/video-generation/model/video-generation-schema";

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

describe("VideoGenerationForm", () => {
  beforeEach(() => {
    startGenerationMock.mockClear();
    resetMock.mockClear();
  });

  it("renders model selection cards", () => {
    render(<VideoGenerationForm />);

    expect(screen.getByText("SVD XT 1.1")).toBeInTheDocument();
    expect(screen.getByText("SVD 1.1")).toBeInTheDocument();
    expect(screen.getByText("Gen-2 Alpha")).toBeInTheDocument();
    expect(screen.getByText("Dream Machine")).toBeInTheDocument();
  });

  it("submits prompt and default settings", async () => {
    render(<VideoGenerationForm />);
    const user = userEvent.setup();

    const prompt = screen.getByPlaceholderText(
      "Describe the video you want to generate in detail...",
    );
    const submit = screen.getByRole("button", { name: /generate/i });

    expect(submit).toBeDisabled();
    expect(prompt).toBeInTheDocument();

    await user.type(prompt, "cinematic sunrise");

    expect(submit).not.toBeDisabled();
    await user.click(submit);

    expect(startGenerationMock).toHaveBeenCalledTimes(1);
    expect(startGenerationMock).toHaveBeenCalledWith({
      ...videoGenerationDefaults,
      prompt: "cinematic sunrise",
    });
  });

  it("exposes upload trigger", () => {
    render(<VideoGenerationForm />);

    const uploadButton = screen.getByLabelText("Upload Reference Image");

    expect(uploadButton).toBeInTheDocument();
  });
});
