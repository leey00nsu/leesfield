import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingCtaSection } from "@/widgets/landing/ui/landing-cta-section";
import { renderWithIntl } from "@/test-utils/intl";

describe("LandingCtaSection", () => {
  it("links to image generation without an email field", () => {
    renderWithIntl(<LandingCtaSection />);

    expect(
      screen.getByRole("heading", { name: "Design with leesfield" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Design with leesfield" }).closest(
        `.${["lf", "outline", "map"].join("-")}`,
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Design with leesfield" }).closest(
        "[data-app-card][data-variant='outline-map']",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Get started now/ })).toHaveAttribute(
      "href",
      "/image",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
