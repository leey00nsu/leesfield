import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HistoryItem } from "@/features/generation-history/ui/history-item";
import { renderWithIntl } from "@/test-utils/intl";

const mockPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe("HistoryItem audio", () => {
  it("audio 항목은 /audio 재사용 경로와 오디오 프리뷰를 사용한다", async () => {
    const user = userEvent.setup();
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
      />,
    );

    expect(document.querySelector("audio")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "프롬프트 재사용" }));

    expect(mockPush).toHaveBeenCalledWith(
      "/audio?prompt=hello+audio&model=qwen-tts&referenceText=reference+words",
    );
  });
});
