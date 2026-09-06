import type React from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { renderWithIntl } from "@/test-utils/intl";
import { LandingPlatformSection } from "./landing-platform-section";
vi.mock("@/shared/ui/brand/reveal-content/reveal-content", () => ({
  RevealContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
describe("LandingPlatformSection", () => {
  it("describes the implemented platform and links to its screens", () => {
    renderWithIntl(<LandingPlatformSection />);
    expect(
      screen.getByRole("link", { name: /API로 연결하기/ }),
    ).toHaveAttribute("href", "/api-docs");
    expect(
      screen.getByRole("link", { name: /스페이스로 구성하기/ }),
    ).toHaveAttribute("href", "/spaces");
  });
});
