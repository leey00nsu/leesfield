import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { Header } from "@/widgets/header/ui/header";
import { renderWithIntl } from "@/test-utils/intl";

vi.mock("next/image", () => ({
  default: (
    props: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean },
  ) => {
    const imageProps = { ...props };
    delete imageProps.priority;

    // eslint-disable-next-line @next/next/no-img-element
    return <img {...imageProps} alt={imageProps.alt ?? ""} />;
  },
}));

vi.mock("@/features/auth/logout/api/logout-action", () => ({
  logoutAction: vi.fn(),
}));

vi.mock("@/shared/ui/language-switcher", () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher" />,
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/generate" }));
describe("Header", () => {
  it("combines media navigation and marks the current destination", () => {
    renderWithIntl(<Header />);
    const nav = screen.getByRole("navigation");
    expect(within(nav).getByRole("link", { name: "AI 생성" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).queryByRole("link", { name: "이미지" })).toBeNull();
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.queryByRole("link", { name: "스페이스" })).toBeNull();
  });
  it("offers public navigation in the mobile menu", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Header variant="public" />);
    await user.click(screen.getByRole("button", { name: "메뉴" }));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "AI 생성" }),
    ).toHaveAttribute("href", "/generate");
    expect(
      within(menu).getByRole("menuitem", { name: "API 문서" }),
    ).toHaveAttribute("href", "/api-docs");
  });
  it("keeps Spaces and account API keys available to signed-in users", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Header isAuthenticated userEmail="admin@example.com" />);
    expect(screen.getByRole("link", { name: "스페이스" })).toHaveAttribute(
      "href",
      "/spaces",
    );
    await user.click(screen.getByRole("button", { name: "admin@example.com" }));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "API 키" }),
    ).toHaveAttribute("href", "/api-key");
    expect(
      screen.getByRole("button", { name: "로그아웃" }),
    ).toBeInTheDocument();
  });
});
