import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HistoryItem } from "@/features/generation-history/ui/history-item";
import { renderWithIntl } from "@/test-utils/intl";

describe("HistoryItem audio", () => {
  it("renders an audio visual tile and opens detail through tile selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    renderWithIntl(
      <HistoryItem
        item={{
          id: "item-audio-1",
          type: "audio" as never,
          status: "completed",
          prompt: "hello audio",
          model: "qwen-tts",
          createdAt: "2026-02-03T00:00:00.000Z",
          resultUrl: "https://example.com/result.mp3",
          thumbnailUrl: null,
          inputAudios: ["data:audio/wav;base64,UklGRg=="],
          referenceText: "reference words",
          errorMessage: null,
        }}
        onSelect={onSelect}
      />,
    );

    expect(document.querySelector("audio")).toBeNull();
    expect(screen.getByText("오디오")).toBeInTheDocument();
    expect(screen.getByText("완료")).toBeInTheDocument();
    expect(screen.getByText("qwen-tts")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "프롬프트 복사" })).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /결과 상세 보기: hello audio/ }),
    );
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "item-audio-1" }));
  });
});
