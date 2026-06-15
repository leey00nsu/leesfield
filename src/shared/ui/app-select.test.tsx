import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AppSelectContent,
  AppSelectItem,
  AppSelectRoot,
  AppSelectTrigger,
  AppSelectValue,
} from "@/shared/ui/app-select";
import { renderWithIntl } from "@/test-utils/intl";

describe("AppSelect", () => {
  it("renders portal content above generation settings popovers", () => {
    renderWithIntl(
      <AppSelectRoot defaultOpen defaultValue="auto">
        <AppSelectTrigger aria-label="Language">
          <AppSelectValue />
        </AppSelectTrigger>
        <AppSelectContent>
          <AppSelectItem value="auto">Auto</AppSelectItem>
          <AppSelectItem value="korean">Korean</AppSelectItem>
        </AppSelectContent>
      </AppSelectRoot>,
    );

    expect(screen.getByRole("listbox")).toHaveClass("z-[100]");
  });
});
