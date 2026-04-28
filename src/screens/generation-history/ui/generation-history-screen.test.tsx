import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GenerationHistoryScreen } from "@/screens/generation-history/ui/generation-history-screen";
import { renderWithIntl } from "@/test-utils/intl";

const useGenerationHistoryListMock = vi.fn();
const routerPushMock = vi.hoisted(() => vi.fn());
const clipboardWriteTextMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
  }),
}));

vi.mock("@/features/generation-history/hook/use-generation-history-list", () => ({
  useGenerationHistoryList: (...args: unknown[]) => useGenerationHistoryListMock(...args),
}));

const detailFixture = vi.hoisted(() => ({
  id: "history-detail-1",
  type: "image",
  status: "completed",
  prompt: "medium shot editorial result",
  model: "flux2-klein-9b",
  createdAt: "2026-03-10T00:00:00.000Z",
  resultUrl: "https://example.com/result.png",
  thumbnailUrl: "https://example.com/thumb.png",
  errorMessage: null,
} as const));

vi.mock("@/features/generation-history/ui/history-list", () => ({
  HistoryList: ({
    onSelectItem,
  }: {
    onSelectItem?: (item: typeof detailFixture) => void;
  }) => (
    <button type="button" data-testid="history-list" onClick={() => onSelectItem?.(detailFixture)}>
      open detail
    </button>
  ),
}));

describe("GenerationHistoryScreen", () => {
  beforeEach(() => {
    useGenerationHistoryListMock.mockReset();
    routerPushMock.mockReset();
    clipboardWriteTextMock.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: clipboardWriteTextMock,
      },
      configurable: true,
    });
  });

  it("shows an audio filter and requests audio history when selected", () => {
    useGenerationHistoryListMock.mockReturnValue({
      items: [],
      total: 0,
      isLoading: false,
      error: null,
      sentinelRef: { current: null },
      removeItem: vi.fn(),
    });

    renderWithIntl(<GenerationHistoryScreen />);

    const audioFilter = screen.getByRole("button", { name: "오디오" });
    expect(audioFilter).toBeInTheDocument();
    expect(useGenerationHistoryListMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "all",
        sort: "date_desc",
        query: "",
      }),
    );

    fireEvent.click(audioFilter);

    expect(useGenerationHistoryListMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "audio",
        sort: "date_desc",
        query: "",
      }),
    );
  });

  it("renders the infinite loading sentinel without decorative pill styles", () => {
    useGenerationHistoryListMock.mockReturnValue({
      items: [
        {
          id: "history-1",
          type: "image",
          status: "completed",
          prompt: "prompt",
          createdAt: "2026-03-10T00:00:00.000Z",
        },
      ],
      total: 2,
      isLoading: true,
      error: null,
      sentinelRef: { current: null },
      removeItem: vi.fn(),
    });

    renderWithIntl(<GenerationHistoryScreen />);

    const sentinel = screen.getByTestId("history-infinite-sentinel");
    expect(sentinel).not.toHaveClass("rounded-full");
    expect(sentinel).not.toHaveClass("border");
    expect(sentinel).not.toHaveClass("bg-surface-dark/60");
  });

  it("opens a gallery detail rail from a selected history item", () => {
    useGenerationHistoryListMock.mockReturnValue({
      items: [detailFixture],
      total: 1,
      isLoading: false,
      error: null,
      sentinelRef: { current: null },
      removeItem: vi.fn(),
    });

    renderWithIntl(<GenerationHistoryScreen />);

    fireEvent.click(screen.getByTestId("history-list"));

    expect(
      screen.getByRole("dialog", { name: "결과 상세" }),
    ).toBeInTheDocument();
    expect(screen.getByText("medium shot editorial result")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recreate" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "https://example.com/result.png",
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(clipboardWriteTextMock).toHaveBeenCalledWith(
      "medium shot editorial result",
    );

    fireEvent.click(screen.getByRole("button", { name: "Video" }));
    expect(routerPushMock).toHaveBeenCalledWith(
      "/video?prompt=medium+shot+editorial+result&model=flux2-klein-9b&initImage=https%3A%2F%2Fexample.com%2Fresult.png",
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(routerPushMock).toHaveBeenCalledWith(
      "/image?prompt=medium+shot+editorial+result&model=flux2-klein-9b&initImage=https%3A%2F%2Fexample.com%2Fresult.png",
    );

    expect(screen.getByRole("button", { name: "Upscale" })).toBeDisabled();
  });
});
