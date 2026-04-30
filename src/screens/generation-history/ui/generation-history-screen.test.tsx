import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GenerationHistoryScreen } from "@/screens/generation-history/ui/generation-history-screen";
import { renderWithIntl } from "@/test-utils/intl";

const useGenerationHistoryListMock = vi.fn();
const useMonitoringRequestDetailMock = vi.fn();
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

vi.mock("@/features/monitoring-dashboard/hook/use-monitoring-dashboard", () => ({
  useMonitoringRequestDetail: (...args: unknown[]) =>
    useMonitoringRequestDetailMock(...args),
}));

const detailFixture = vi.hoisted(() => ({
  id: "history-detail-1",
  type: "image",
  status: "completed",
  prompt: "medium shot editorial result",
  model: "flux2-klein-9b",
  createdAt: "2026-03-10T00:00:00.000Z",
  updatedAt: "2026-03-10T00:00:02.500Z",
  durationMs: 2500,
  progress: 100,
  resultUrl: "https://example.com/result.png",
  thumbnailUrl: "https://example.com/thumb.png",
  inputImages: ["https://example.com/input.png"],
  errorMessage: null,
} as const));

vi.mock("@/features/generation-history/ui/history-list", () => ({
  HistoryList: ({
    onSelectItem,
    items,
  }: {
    items: unknown[];
    onSelectItem?: (item: typeof detailFixture) => void;
  }) => (
    <div>
      <span data-testid="history-items-count">{items.length}</span>
      <button
        type="button"
        data-testid="history-list"
        onClick={() => onSelectItem?.((items[0] as typeof detailFixture) ?? detailFixture)}
      >
        open detail
      </button>
    </div>
  ),
}));

describe("GenerationHistoryScreen", () => {
  beforeEach(() => {
    useGenerationHistoryListMock.mockReset();
    useMonitoringRequestDetailMock.mockReset();
    useMonitoringRequestDetailMock.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
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

    expect(screen.queryByText("HISTORY STUDIO")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Results you can reuse." }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("history-items-count")).toHaveTextContent("0");
    expect(screen.queryByRole("button", { name: "History" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Community" })).not.toBeInTheDocument();

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

  it("filters visible history by status while keeping the app toolbar controls", () => {
    useGenerationHistoryListMock.mockReturnValue({
      items: [
        detailFixture,
        {
          ...detailFixture,
          id: "history-detail-2",
          status: "failed",
          prompt: "failed result",
        },
      ],
      total: 2,
      isLoading: false,
      error: null,
      sentinelRef: { current: null },
      removeItem: vi.fn(),
    });

    renderWithIntl(<GenerationHistoryScreen />);

    expect(screen.getByPlaceholderText("프롬프트, 모델, 태그 검색...")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "히스토리 정렬" })).toBeInTheDocument();
    expect(screen.getByTestId("history-items-count")).toHaveTextContent("2");

    fireEvent.click(screen.getByRole("button", { name: "실패" }));
    expect(screen.getByTestId("history-items-count")).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    expect(screen.getByTestId("history-items-count")).toHaveTextContent("2");
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
    expect(screen.getByTestId("history-detail-rail")).toHaveAttribute(
      "data-app-detail-rail",
      "",
    );
    expect(screen.getByRole("tablist", { name: "결과 상세 섹션" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Prompt" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("medium shot editorial result")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(clipboardWriteTextMock).toHaveBeenCalledWith(
      "medium shot editorial result",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
    expect(screen.getByText("Model")).toBeInTheDocument();
    expect(screen.getAllByText("flux2-klein-9b").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Metadata" }));
    expect(screen.getByText("요청 ID")).toBeInTheDocument();
    expect(screen.getByText("history-detail-1")).toBeInTheDocument();
    expect(screen.getByText("요청 시간")).toBeInTheDocument();
    expect(screen.getByText("완료 시간")).toBeInTheDocument();
    expect(screen.getByText("소요 시간")).toBeInTheDocument();
    expect(screen.getByText("2.5s")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByText("입력 이미지")).toBeInTheDocument();
    expect(screen.getByText("결과 이미지")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /이미지/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Recreate" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "https://example.com/result.png",
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

  it("closes the detail overlay from the preview backdrop but not from media or rail clicks", () => {
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

    fireEvent.click(screen.getByTestId("history-detail-preview-media"));
    expect(screen.getByRole("dialog", { name: "결과 상세" })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("history-detail-rail"));
    expect(screen.getByRole("dialog", { name: "결과 상세" })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("history-detail-preview-backdrop"));
    expect(
      screen.queryByRole("dialog", { name: "결과 상세" }),
    ).not.toBeInTheDocument();
  });

  it("hydrates missing rail metadata from the canonical request detail response", () => {
    const staleListItem = {
      ...detailFixture,
      updatedAt: null,
      durationMs: null,
      progress: null,
      resultUrl: null,
      thumbnailUrl: null,
      inputImages: [],
    };
    useGenerationHistoryListMock.mockReturnValue({
      items: [staleListItem],
      total: 1,
      isLoading: false,
      error: null,
      sentinelRef: { current: null },
      removeItem: vi.fn(),
    });
    useMonitoringRequestDetailMock.mockReturnValue({
      data: {
        id: "history-detail-1",
        type: "image",
        status: "completed",
        prompt: "hydrated prompt",
        model: "hydrated-model",
        createdAt: "2026-03-10T00:00:00.000Z",
        updatedAt: "2026-03-10T00:00:02.500Z",
        durationMs: 2500,
        progress: 100,
        errorMessage: null,
        warningMessage: "asset warning",
        inputImages: ["https://example.com/detail-input.png"],
        inputAudios: [],
        referenceText: "hydrated reference",
        assets: [
          {
            url: "https://example.com/detail-result.png",
            width: 1024,
            height: 1024,
            durationSec: null,
          },
        ],
      },
      isLoading: false,
      error: null,
    });

    renderWithIntl(<GenerationHistoryScreen />);

    fireEvent.click(screen.getByTestId("history-list"));

    expect(useMonitoringRequestDetailMock).toHaveBeenCalledWith(
      "image",
      "history-detail-1",
      true,
    );
    expect(screen.getByText("hydrated prompt")).toBeInTheDocument();
    expect(screen.getByText("hydrated reference")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
    expect(screen.getAllByText("hydrated-model").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("100%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Metadata" }));
    const completedAtRow = screen.getByText("완료 시간").parentElement;
    expect(completedAtRow).toHaveTextContent("2026");
    expect(completedAtRow).not.toHaveTextContent("-");
    expect(screen.getByText("2.5s")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByText("경고 메시지")).toBeInTheDocument();
    expect(screen.getByText("asset warning")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "https://example.com/detail-result.png",
    );

    fireEvent.click(screen.getByRole("button", { name: "Video" }));
    expect(routerPushMock).toHaveBeenCalledWith(
      "/video?prompt=hydrated+prompt&model=hydrated-model&initImage=https%3A%2F%2Fexample.com%2Fdetail-result.png",
    );
  });

  it("collapses long prompt text and expands it on request", () => {
    const longPrompt = [
      "A majestic mountain landscape at golden hour with dramatic clouds",
      "a winding river through the valley",
      "a cinematic photorealistic style",
      "precise camera direction",
      "reusable lighting notes",
      "and production-ready composition details.",
    ].join(", ");

    useGenerationHistoryListMock.mockReturnValue({
      items: [{ ...detailFixture, prompt: longPrompt }],
      total: 1,
      isLoading: false,
      error: null,
      sentinelRef: { current: null },
      removeItem: vi.fn(),
    });

    renderWithIntl(<GenerationHistoryScreen />);

    fireEvent.click(screen.getByTestId("history-list"));

    const showMore = screen.getByRole("button", { name: "더 보기" });
    expect(showMore).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(showMore);

    expect(screen.getByRole("button", { name: "접기" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("shows placeholders for missing request detail metadata", () => {
    const pendingFixture = {
      ...detailFixture,
      id: "pending-detail",
      status: "pending",
      updatedAt: null,
      durationMs: null,
      progress: null,
      resultUrl: null,
      thumbnailUrl: null,
      inputImages: [],
    } as const;

    useGenerationHistoryListMock.mockReturnValue({
      items: [pendingFixture],
      total: 1,
      isLoading: false,
      error: null,
      sentinelRef: { current: null },
      removeItem: vi.fn(),
    });

    renderWithIntl(<GenerationHistoryScreen />);

    fireEvent.click(screen.getByTestId("history-list"));

    fireEvent.click(screen.getByRole("tab", { name: "Metadata" }));
    expect(screen.getByText("pending-detail")).toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByText("입력 자산 없음")).toBeInTheDocument();
    expect(screen.getByText("결과 없음")).toBeInTheDocument();
  });
});
