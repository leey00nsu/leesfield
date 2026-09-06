import type React from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { renderWithIntl } from "@/test-utils/intl";
import { LandingCtaSection } from "./landing-cta-section";
vi.mock("@/shared/ui/brand/reveal-content/reveal-content", () => ({
  RevealContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
describe("LandingCtaSection", () => {
  it("describes the implemented platform and links to its screens", () => {
    renderWithIntl(<LandingCtaSection />);
    expect(screen.getByRole("link", { name: "AI 생성 열기" })).toHaveAttribute(
      "href",
      "/generate",
    );
    expect(screen.getByRole("link", { name: "API 문서 보기" })).toHaveAttribute(
      "href",
      "/api-docs",
    );
  });
});
