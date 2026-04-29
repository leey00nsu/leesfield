import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingCtaSection } from "@/widgets/landing/ui/landing-cta-section";
import { renderWithIntl } from "@/test-utils/intl";

describe("LandingCtaSection", () => {
  it("links to image generation without an email field", () => {
    renderWithIntl(<LandingCtaSection />);

    expect(
      screen.getByRole("heading", { name: "이미지부터 시작" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /이미지 만들기/ })).toHaveAttribute(
      "href",
      "/image",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
