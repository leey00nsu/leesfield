import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  it("renders model selection cards", () => {
    render(<VideoGenerationForm />);

    expect(screen.getByText("Wan 2.2 (HF Space)")).toBeInTheDocument();
  });

  it("submits prompt and default settings", async () => {
    const { container } = render(<VideoGenerationForm />);
    const user = userEvent.setup();

    const prompt = screen.getByPlaceholderText(
      "Describe the video you want to generate in detail...",
    );
    const submit = screen.getByRole("button", { name: /generate/i });
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

    await screen.findByAltText("Init image preview");
    expect(submit).not.toBeDisabled();
    await user.click(submit);

    expect(startGenerationMock).toHaveBeenCalledTimes(1);
    expect(startGenerationMock).toHaveBeenCalledWith({
      ...videoGenerationDefaults,
      initImage: "data:image/png;base64,AAAA",
      prompt: "cinematic sunrise",
    });
  });

  it("exposes upload trigger", () => {
    render(<VideoGenerationForm />);

    const uploadButton = screen.getByLabelText("Upload Reference Image");

    expect(uploadButton).toBeInTheDocument();
  });
});
