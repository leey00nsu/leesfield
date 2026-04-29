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

describe("Header", () => {
  it("대시보드 네비게이션에 Audio 링크를 노출한다", () => {
    const { container } = renderWithIntl(
      <Header isAuthenticated userEmail="admin@example.com" />,
    );

    expect(container.querySelectorAll('a[href="/audio"]').length).toBeGreaterThan(0);
  });

  it("브랜드 로고 이미지를 rounded icon으로 표시한다", () => {
    const { container } = renderWithIntl(
      <Header isAuthenticated userEmail="admin@example.com" />,
    );

    const logoImage = container.querySelector('img[src="/logo.webp"]');
    expect(logoImage?.parentElement).toHaveClass("rounded-xl");
  });

  it("public header navigation uses the sans font tone", () => {
    renderWithIntl(<Header variant="public" />);

    const desktopNav = screen.getByRole("navigation");
    const imageLink = within(desktopNav).getByRole("link", { name: "이미지" });

    expect(imageLink).toHaveClass("font-medium");
    expect(imageLink).not.toHaveClass("lf-serif");
  });

  it("desktop nav 링크는 xl 미만 숨김용 라벨 wrapper와 접근성 이름을 가진다", () => {
    renderWithIntl(<Header isAuthenticated userEmail="admin@example.com" />);

    const desktopNav = screen.getByRole("navigation");
    const audioLink = within(desktopNav).getByRole("link", { name: "오디오" });
    const label = within(audioLink).getByText("오디오");

    expect(audioLink).toHaveAttribute("aria-label", "오디오");
    expect(label.tagName).toBe("SPAN");
    expect(label).toHaveClass("hidden");
    expect(label).toHaveClass("xl:inline");
  });

  it("모바일 메뉴를 열면 Audio 링크가 보인다", async () => {
    const user = userEvent.setup();
    const { container } = renderWithIntl(
      <Header isAuthenticated userEmail="admin@example.com" />,
    );

    expect(container.querySelectorAll('a[href="/audio"]').length).toBe(1);
    await user.click(screen.getByRole("button", { name: /메뉴/i }));

    const audioLinks = container.ownerDocument.querySelectorAll('a[href="/audio"]');
    expect(audioLinks.length).toBeGreaterThan(1);

    const dropdownAudioLink = audioLinks[audioLinks.length - 1];
    expect(dropdownAudioLink).toHaveTextContent("오디오");
    expect(dropdownAudioLink.querySelector("span")).toBeNull();
  });
});
