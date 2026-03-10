import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GenerationHistoryScreen } from "@/screens/generation-history/ui/generation-history-screen";
import { renderWithIntl } from "@/test-utils/intl";

const useGenerationHistoryListMock = vi.fn();

vi.mock("@/features/generation-history/hook/use-generation-history-list", () => ({
  useGenerationHistoryList: (...args: unknown[]) => useGenerationHistoryListMock(...args),
}));

vi.mock("@/features/generation-history/ui/history-list", () => ({
  HistoryList: () => <div data-testid="history-list" />,
}));

describe("GenerationHistoryScreen", () => {
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
});
