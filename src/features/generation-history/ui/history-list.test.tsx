import { describe, expect, it } from "vitest";
import { HistoryList } from "@/features/generation-history/ui/history-list";
import { renderWithIntl } from "@/test-utils/intl";

describe("HistoryList", () => {
  it("uses grid layout for loading skeletons", () => {
    const { container } = renderWithIntl(<HistoryList items={[]} isLoading />);

    const wrapper = container.firstElementChild;
    expect(wrapper).toBeTruthy();
    expect(wrapper).toHaveClass("grid");
    expect(wrapper).toHaveClass("grid-cols-1");
    expect(wrapper).toHaveClass("sm:grid-cols-2");
    expect(wrapper).toHaveClass("xl:grid-cols-3");
    expect(wrapper).not.toHaveClass("columns-1");
  });
});

