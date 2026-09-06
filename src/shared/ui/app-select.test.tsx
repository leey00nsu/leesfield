import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  AppSelectContent,
  AppSelectItem,
  AppSelectRoot,
  AppSelectTrigger,
  AppSelectValue,
} from "@/shared/ui/app-select";
import { renderWithIntl } from "@/test-utils/intl";
describe("AppSelect", () => {
  it("selects through a portal and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { container } = renderWithIntl(
      <AppSelectRoot
        defaultOpen
        defaultValue="auto"
        onValueChange={onValueChange}
      >
        <AppSelectTrigger aria-label="Language">
          <AppSelectValue />
        </AppSelectTrigger>
        <AppSelectContent>
          <AppSelectItem value="auto">Auto</AppSelectItem>
          <AppSelectItem value="korean">Korean</AppSelectItem>
        </AppSelectContent>
      </AppSelectRoot>,
    );
    expect(container).not.toContainElement(screen.getByRole("listbox"));
    await user.click(screen.getByRole("option", { name: "Korean" }));
    expect(onValueChange).toHaveBeenCalledWith("korean");
    expect(screen.getByRole("combobox")).toHaveFocus();
  });
});
