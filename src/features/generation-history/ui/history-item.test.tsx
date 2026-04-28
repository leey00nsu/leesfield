import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  HistoryItem,
  HistoryItemSkeleton,
} from "@/features/generation-history/ui/history-item";
import { renderWithIntl } from "@/test-utils/intl";

describe("HistoryItem", () => {
  it("renders an image-first tile with hover/focus metadata pills", () => {
    renderWithIntl(
      <HistoryItem
        item={{
          id: "item-1",
          type: "image",
          status: "completed",
          prompt: "a prompt",
          model: "flux2-klein-9b",
          createdAt: "2026-02-03T00:00:00.000Z",
          resultUrl: "https://example.com/result.png",
          thumbnailUrl: "https://example.com/preview.png",
          errorMessage: null,
        }}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("img", { name: "생성 결과 미리보기" }),
    ).toBeInTheDocument();
    expect(screen.getByText("이미지")).toBeInTheDocument();
    expect(screen.getByText("완료")).toBeInTheDocument();
    expect(screen.getByText("flux2-klein-9b")).toBeInTheDocument();
    expect(screen.queryByText("더보기")).not.toBeInTheDocument();
    expect(screen.queryByText("a prompt")).not.toBeInTheDocument();
  });

  it("selects the whole tile instead of opening a prompt modal", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    renderWithIntl(
      <HistoryItem
        item={{
          id: "item-2",
          type: "image",
          status: "completed",
          prompt: "detail prompt",
          model: null,
          createdAt: "2026-02-03T00:00:00.000Z",
          resultUrl: "https://example.com/result.png",
          thumbnailUrl: null,
          errorMessage: null,
        }}
        onSelect={onSelect}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /결과 상세 보기: detail prompt/ }),
    );

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "item-2" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows failed and processing state overlays without card action controls", () => {
    const { rerender } = renderWithIntl(
      <HistoryItem
        item={{
          id: "failed-1",
          type: "image",
          status: "failed",
          prompt: "failed prompt",
          model: null,
          createdAt: "2026-02-03T00:00:00.000Z",
          resultUrl: null,
          thumbnailUrl: null,
          errorMessage: "boom",
        }}
      />,
    );

    expect(screen.getAllByText("실패").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(
      <HistoryItem
        item={{
          id: "processing-1",
          type: "video",
          status: "processing",
          prompt: "processing prompt",
          model: null,
          createdAt: "2026-02-03T00:00:00.000Z",
          resultUrl: null,
          thumbnailUrl: null,
          errorMessage: null,
        }}
      />,
    );

    expect(screen.getByText("비디오")).toBeInTheDocument();
    expect(screen.getByText("처리중")).toBeInTheDocument();
  });

  it("keeps image loading skeleton scoped to the media tile", async () => {
    renderWithIntl(
      <HistoryItem
        item={{
          id: "item-3",
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
    fireEvent.load(previewImg);

    expect(previewImg).toHaveClass("object-cover");
    expect(screen.queryByText("프롬프트 재사용")).not.toBeInTheDocument();
  });

  it("HistoryItemSkeleton renders only a media placeholder", () => {
    const { container } = renderWithIntl(<HistoryItemSkeleton />);

    const root = screen.getByTestId("history-item-skeleton");
    const media = screen.getByTestId("history-item-skeleton-media");

    expect(root.tagName).toBe("ARTICLE");
    expect(
      within(media).getByTestId("history-item-skeleton-media-fill"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("history-item-skeleton-prompt")).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1);
  });
});
