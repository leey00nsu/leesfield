import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingFooter } from "@/widgets/landing/ui/landing-footer";
import { renderWithIntl } from "@/test-utils/intl";

describe("LandingFooter", () => {
  it("links only to the project GitHub repository in social links", () => {
    renderWithIntl(<LandingFooter />);

    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/leey00nsu/leesfield",
    );
    expect(screen.queryByRole("link", { name: "X" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Discord" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "LinkedIn" })).not.toBeInTheDocument();
  });
});
