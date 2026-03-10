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

    const { container } = renderWithIntl(<HistoryList items={items} />);
    const wrapper = container.firstElementChild;

    Array.from(wrapper?.children ?? []).forEach((column) => {
      expect(column).toHaveClass("self-start");
      expect(column).toHaveClass("content-start");
    });
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
