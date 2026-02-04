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
    expect(wrapper).toHaveClass("md:grid-cols-4");
    expect(wrapper).not.toHaveClass("columns-1");

    expect(wrapper?.children.length).toBe(2);
    Array.from(wrapper?.children ?? []).forEach((column) => {
      expect(column).toHaveClass("grid");
    });
  });
});
