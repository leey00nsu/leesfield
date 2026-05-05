import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingCoreFeaturesSection } from "@/widgets/landing/ui/landing-core-features-section";
import { renderWithIntl } from "@/test-utils/intl";

describe("LandingCoreFeaturesSection", () => {
  it("shows concise end-user feature cards", () => {
    renderWithIntl(<LandingCoreFeaturesSection />);

    expect(
      screen.getByRole("heading", {
        name: "A workflow built for controlled generation.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Generate")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Monitor")).toBeInTheDocument();
    expect(screen.getByText("Integrate")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Monitor/i }),
    ).toHaveAttribute("href", "/monitoring");
    expect(screen.getByTestId("landing-review-skeleton-grid")).toBeInTheDocument();
    expect(screen.queryByText("Succeeded")).not.toBeInTheDocument();
    expect(screen.getByText("Image / Video / Audio usage")).toBeInTheDocument();
    expect(screen.getByText("/v2/image/generate")).toBeInTheDocument();
    expect(screen.queryByText("Export project")).not.toBeInTheDocument();
    expect(screen.queryByText(/components\/ui/)).not.toBeInTheDocument();
  });
});
