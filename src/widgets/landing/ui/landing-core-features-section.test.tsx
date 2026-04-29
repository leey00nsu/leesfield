import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingCoreFeaturesSection } from "@/widgets/landing/ui/landing-core-features-section";
import { renderWithIntl } from "@/test-utils/intl";

describe("LandingCoreFeaturesSection", () => {
  it("shows concise end-user feature cards", () => {
    renderWithIntl(<LandingCoreFeaturesSection />);

    expect(
      screen.getByRole("heading", { name: "만들고, 고르고, 다시 쓰세요" }),
    ).toBeInTheDocument();
    expect(screen.getByText("프롬프트")).toBeInTheDocument();
    expect(screen.getByText("이미지")).toBeInTheDocument();
    expect(screen.getByText("비디오")).toBeInTheDocument();
    expect(screen.getByText("오디오")).toBeInTheDocument();
    expect(screen.queryByText(/components\/ui/)).not.toBeInTheDocument();
  });
});
