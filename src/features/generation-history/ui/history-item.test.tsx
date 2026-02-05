import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HistoryItem } from "@/features/generation-history/ui/history-item";
import { renderWithIntl } from "@/test-utils/intl";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("HistoryItem", () => {
  it("이미지 로딩 전에는 스켈레톤을 표시하고, 로딩 완료 후에는 이미지를 표시한다", async () => {
    renderWithIntl(
      <HistoryItem
        item={{
          id: "item-1",
          type: "image",
          status: "completed",
          prompt: "a prompt",
          model: null,
          createdAt: "2026-02-03T00:00:00.000Z",
          resultUrl: null,
          thumbnailUrl: "https://example.com/preview.png",
          errorMessage: null,
        }}
      />,
    );

    const previewImg = screen.getByRole("img", { name: "생성 결과 미리보기" });
    expect(previewImg).toHaveClass("opacity-0");
    expect(document.querySelector('[data-slot="skeleton"]')).toBeTruthy();

    fireEvent.load(previewImg);

    await waitFor(() => {
      expect(document.querySelector('[data-slot="skeleton"]')).toBeNull();
      expect(previewImg).toHaveClass("opacity-100");
    });
  });

  it("이미지 로딩 실패 시 fallback UI를 표시한다", async () => {
    renderWithIntl(
      <HistoryItem
        item={{
          id: "item-2",
          type: "image",
          status: "completed",
          prompt: "a prompt",
          model: null,
          createdAt: "2026-02-03T00:00:00.000Z",
          resultUrl: null,
          thumbnailUrl: "https://example.com/preview.png",
          errorMessage: null,
        }}
      />,
    );

    const previewImg = screen.getByRole("img", { name: "생성 결과 미리보기" });
    expect(document.querySelector('[data-slot="skeleton"]')).toBeTruthy();

    fireEvent.error(previewImg);

    await waitFor(() => {
      expect(document.querySelector('[data-slot="skeleton"]')).toBeNull();
      expect(
        screen.queryByRole("img", { name: "생성 결과 미리보기" }),
      ).toBeNull();
      expect(screen.getByText("생성 결과 미리보기")).toBeInTheDocument();
    });
  });

  it("프롬프트가 길면 더보기 버튼으로 모달을 열 수 있다", async () => {
    const user = userEvent.setup();
    const longPrompt = Array.from({ length: 200 })
      .map(() => "a")
      .join("");

    renderWithIntl(
      <HistoryItem
        item={{
          id: "item-3",
          type: "image",
          status: "completed",
          prompt: longPrompt,
          model: null,
          createdAt: "2026-02-03T00:00:00.000Z",
          resultUrl: null,
          thumbnailUrl: null,
          errorMessage: null,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "더보기" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(longPrompt)).toBeInTheDocument();
  });
});
