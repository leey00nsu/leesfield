import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryList } from "@/features/generation-history/ui/history-list";
import { renderWithIntl } from "@/test-utils/intl";

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
