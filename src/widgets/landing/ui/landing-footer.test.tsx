import type React from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { renderWithIntl } from "@/test-utils/intl";
import { LandingFooter } from "./landing-footer";
vi.mock("@/shared/ui/brand/reveal-content/reveal-content", () => ({
  RevealContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
describe("LandingFooter", () => {
  it("describes the implemented platform and links to its screens", () => {
    renderWithIntl(<LandingFooter />);
    expect(screen.getByRole("link", { name: "AI 생성" })).toHaveAttribute(
      "href",
      "/generate",
    );
    expect(screen.getByRole("link", { name: "API 키" })).toHaveAttribute(
      "href",
      "/api-key",
    );
  });
});
