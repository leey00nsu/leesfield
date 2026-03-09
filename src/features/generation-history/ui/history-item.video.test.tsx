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

describe("HistoryItem video", () => {
  it("video 항목은 플레이어 위 전체 오버레이 없이 /video 재사용 경로를 사용한다", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <HistoryItem
        item={{
          id: "item-video-1",
          type: "video" as never,
          status: "completed",
          prompt: "hello video",
          model: "wan-video",
          createdAt: "2026-02-03T00:00:00.000Z",
          resultUrl: "https://example.com/result.mp4",
          thumbnailUrl: null,
          inputImages: ["https://example.com/init.png"],
          errorMessage: null,
        }}
      />,
    );

    expect(document.querySelector("video")).not.toBeNull();
    const reuseButton = screen.getByRole("button", { name: "프롬프트 재사용" });
    const downloadLink = screen.getByRole("link", { name: "다운로드" });
    const copyButton = screen.getByRole("button", { name: "프롬프트 복사" });
    const openLink = screen.getByRole("link", { name: "열기" });

    expect(reuseButton.closest(".absolute.inset-0")).toBeNull();
    expect(downloadLink).toHaveTextContent("다운로드");
    expect(reuseButton).not.toHaveTextContent("프롬프트 재사용");

    await user.tab();
    expect(screen.getByRole("button", { name: "더보기" })).toHaveFocus();
    await user.tab();
    expect(downloadLink).toHaveFocus();
    await user.tab();
    expect(reuseButton).toHaveFocus();
    expect(
      (await screen.findAllByRole("tooltip", { hidden: true })).some((tooltip) =>
        tooltip.textContent?.includes("프롬프트 재사용"),
      ),
    ).toBe(true);

    await user.tab();
    expect(copyButton).toHaveFocus();
    expect(
      (await screen.findAllByRole("tooltip", { hidden: true })).some((tooltip) =>
        tooltip.textContent?.includes("프롬프트 복사"),
      ),
    ).toBe(true);

    await user.tab();
    expect(openLink).toHaveFocus();
    expect(
      (await screen.findAllByRole("tooltip", { hidden: true })).some((tooltip) =>
        tooltip.textContent?.includes("열기"),
      ),
    ).toBe(true);

    await user.click(reuseButton);

    expect(mockPush).toHaveBeenCalledWith(
      "/video?prompt=hello+video&model=wan-video&initImage=https%3A%2F%2Fexample.com%2Finit.png",
    );
  });
});
