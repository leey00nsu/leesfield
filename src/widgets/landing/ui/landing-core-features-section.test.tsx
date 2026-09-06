import type React from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { renderWithIntl } from "@/test-utils/intl";
import { LandingCoreFeaturesSection } from "./landing-core-features-section";
vi.mock("@/shared/ui/brand/reveal-content/reveal-content", () => ({
  RevealContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
describe("LandingCoreFeaturesSection", () => {
  it("describes the implemented platform and links to its screens", () => {
    renderWithIntl(<LandingCoreFeaturesSection />);
    expect(
      screen.getByRole("heading", {
        name: "통합 모델 인터페이스",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "확장 가능한 제공업체 구조" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("99.2%")).toBeNull();
  });
});
