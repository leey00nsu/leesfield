import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingCtaSection } from "@/widgets/landing/ui/landing-cta-section";
import { renderWithIntl } from "@/test-utils/intl";

describe("LandingCtaSection", () => {
  it("links to image generation without an email field", () => {
    renderWithIntl(<LandingCtaSection />);

    expect(
      screen.getByRole("heading", { name: "지금 바로 시작해보세요" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /시작하기/ })).toHaveAttribute(
      "href",
      "/image",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
