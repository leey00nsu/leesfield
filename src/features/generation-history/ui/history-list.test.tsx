import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryList } from "@/features/generation-history/ui/history-list";
import { renderWithIntl } from "@/test-utils/intl";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/features/monitoring-dashboard/hook/use-monitoring-dashboard", () => ({
  useMonitoringRequestDetail: () => ({
    data: null,
    isLoading: false,
    error: null,
  }),
}));

const originalMatchMedia = window.matchMedia;

function mockMatchMedia({
  isMdUp,
  isXlUp,
}: {
  isMdUp: boolean;
  isXlUp: boolean;
}) {
  window.matchMedia = vi.fn((query: string) => {
    const matches =
      query === "(min-width: 1280px)"
        ? isXlUp
        : query === "(min-width: 768px)"
          ? isMdUp
          : false;

    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  }) as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
});

describe("HistoryList", () => {
  it("keeps history columns top-aligned so video cards do not leave empty gaps", () => {
    mockMatchMedia({ isMdUp: true, isXlUp: false });

    const items = Array.from({ length: 3 }, (_, index) => ({
      id: `item-${index + 1}`,
      type: "video" as const,
      status: "completed" as const,
      prompt: `prompt-${index + 1}`,
      model: null,
      createdAt: "2026-02-03T00:00:00.000Z",
      resultUrl: "https://example.com/video.mp4",
      thumbnailUrl: null,
      errorMessage: null,
    }));

    renderWithIntl(<HistoryList items={items} />);
    const wrapper = screen.getByTestId("history-gallery-grid");

    Array.from(wrapper?.children ?? []).forEach((column) => {
      expect(column).toHaveClass("self-start");
      expect(column).toHaveClass("content-start");
    });
  });

  it("renders completed results as a gallery before failed or processing activity", () => {
    mockMatchMedia({ isMdUp: false, isXlUp: false });

    renderWithIntl(
      <HistoryList
        items={[
          {
            id: "failed-1",
            type: "image",
            status: "failed",
            prompt: "failed prompt",
            model: null,
            createdAt: "2026-02-03T00:00:00.000Z",
            resultUrl: null,
            thumbnailUrl: null,
            errorMessage: "boom",
          },
          {
            id: "completed-1",
            type: "image",
            status: "completed",
            prompt: "completed prompt",
            model: null,
            createdAt: "2026-02-03T00:00:00.000Z",
            resultUrl: "https://example.com/result.png",
            thumbnailUrl: "https://example.com/thumb.png",
            errorMessage: null,
          },
          {
            id: "processing-1",
            type: "video",
            status: "processing",
            prompt: "processing prompt",
            model: null,
            createdAt: "2026-02-03T00:00:00.000Z",
            resultUrl: null,
            thumbnailUrl: null,
            errorMessage: null,
          },
        ]}
      />,
    );

    const gallery = screen.getByRole("region", { name: "결과 갤러리" });
    const activity = screen.getByRole("region", { name: "상태 활동" });

    expect(within(gallery).getByText("completed prompt")).toBeInTheDocument();
    expect(within(activity).getByText("failed prompt")).toBeInTheDocument();
    expect(within(activity).getByText("processing prompt")).toBeInTheDocument();
    expect(
      screen.getByText("completed prompt").compareDocumentPosition(
        screen.getByText("failed prompt"),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it.each([
    {
      name: "small viewport",
      media: { isMdUp: false, isXlUp: false },
      expectedColumns: 2,
      expectedItemsPerColumn: [5, 4],
    },
    {
      name: "medium viewport",
      media: { isMdUp: true, isXlUp: false },
      expectedColumns: 3,
      expectedItemsPerColumn: [3, 3, 3],
    },
    {
      name: "xl viewport",
      media: { isMdUp: true, isXlUp: true },
      expectedColumns: 4,
      expectedItemsPerColumn: [3, 2, 2, 2],
    },
  ])("uses responsive skeleton columns for $name", ({
    media,
    expectedColumns,
    expectedItemsPerColumn,
  }) => {
    mockMatchMedia(media);

    const { container } = renderWithIntl(<HistoryList items={[]} isLoading />);

    const wrapper = container.firstElementChild;
    expect(wrapper).toBeTruthy();
    expect(wrapper).toHaveClass("grid");
    expect(wrapper).toHaveClass("grid-cols-2");
    expect(wrapper).toHaveClass("md:grid-cols-3");
    expect(wrapper).toHaveClass("xl:grid-cols-4");
    expect(wrapper).not.toHaveClass("columns-1");

    expect(wrapper?.children.length).toBe(expectedColumns);
    Array.from(wrapper?.children ?? []).forEach((column, index) => {
      expect(column).toHaveClass("grid");
      expect(column).not.toHaveClass("hidden");
      expect(column.children.length).toBe(expectedItemsPerColumn[index]);
    });
  });
});
