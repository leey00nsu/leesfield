import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingCoreFeaturesSection } from "@/widgets/landing/ui/landing-core-features-section";
import { renderWithIntl } from "@/test-utils/intl";

describe("LandingCoreFeaturesSection", () => {
  it("shows concise end-user feature cards", () => {
    renderWithIntl(<LandingCoreFeaturesSection />);

    expect(
      screen.getByRole("heading", {
        name: "제어 가능한 생성을 위한 워크플로우.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("생성")).toBeInTheDocument();
    expect(screen.getByText("검토")).toBeInTheDocument();
    expect(screen.getByText("모니터링")).toBeInTheDocument();
    expect(screen.getByText("연동")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /모니터링/i }),
    ).toHaveAttribute("href", "/monitoring");
    expect(screen.getByTestId("landing-review-skeleton-grid")).toBeInTheDocument();
    expect(screen.queryByText("Succeeded")).not.toBeInTheDocument();
    expect(screen.getByText("이미지 / 비디오 / 오디오 사용량")).toBeInTheDocument();
    expect(screen.getByText("/v2/image/generate")).toBeInTheDocument();
    expect(screen.queryByText("Export project")).not.toBeInTheDocument();
    expect(screen.queryByText(/components\/ui/)).not.toBeInTheDocument();
  });
});
