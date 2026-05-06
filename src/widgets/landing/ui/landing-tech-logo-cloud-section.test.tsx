import type React from "react";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LandingTechLogoCloudSection } from "@/widgets/landing/ui/landing-tech-logo-cloud-section";
import { renderWithIntl } from "@/test-utils/intl";

vi.mock("@/shared/ui/infinite-slider", () => ({
  InfiniteSlider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="infinite-slider">{children}</div>
  ),
}));

describe("LandingTechLogoCloudSection", () => {
  it("shows the technology stack as a logo cloud", () => {
    renderWithIntl(<LandingTechLogoCloudSection />);

    expect(
      screen.getByRole("heading", {
        name: "Tech Stacks",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("infinite-slider")).toBeInTheDocument();
    expect(screen.getByText("Next.js")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
  });
});
