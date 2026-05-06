import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LanguageSwitcher } from "@/shared/ui/language-switcher";
import { renderWithIntl } from "@/test-utils/intl";
import enMessages from "@/shared/i18n/messages/en.json";

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => routerMocks,
}));

describe("LanguageSwitcher", () => {
  it("uses the sans font for the dropdown label", async () => {
    const user = userEvent.setup();
    renderWithIntl(<LanguageSwitcher />, {
      locale: "en",
      messages: enMessages,
    });

    await user.click(screen.getByRole("button", { name: "Language" }));

    const label = screen.getByText("Language");
    expect(label).toHaveClass("font-sans");
    expect(label).not.toHaveClass("font-display");
  });
});
