import { describe, expect, it } from "vitest";
import { HistoryList } from "@/features/generation-history/ui/history-list";
import { renderWithIntl } from "@/test-utils/intl";

describe("HistoryList", () => {
  it("uses grid layout for loading skeletons", () => {
    const { container } = renderWithIntl(<HistoryList items={[]} isLoading />);

    const wrapper = container.firstElementChild;
    expect(wrapper).toBeTruthy();
    expect(wrapper).toHaveClass("grid");
    expect(wrapper).toHaveClass("grid-cols-2");
    expect(wrapper).toHaveClass("md:grid-cols-3");
    expect(wrapper).toHaveClass("xl:grid-cols-4");
    expect(wrapper).not.toHaveClass("columns-1");

    expect(wrapper?.children.length).toBe(4);
    Array.from(wrapper?.children ?? []).forEach((column, index) => {
      if (index < 2) {
        expect(column).toHaveClass("grid");
        expect(column.children.length).toBe(index === 0 ? 3 : 2);
        return;
      }
      if (index === 2) {
        expect(column).toHaveClass("hidden");
        expect(column).toHaveClass("md:grid");
        expect(column).not.toHaveClass("xl:hidden");
        expect(column.children.length).toBe(2);
        return;
      }
      expect(column).toHaveClass("hidden");
      expect(column).toHaveClass("xl:grid");
      expect(column.children.length).toBe(2);
    });
  });
});
