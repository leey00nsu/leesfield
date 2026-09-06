import type React from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { renderWithIntl } from "@/test-utils/intl";
import { LandingReuseSection } from "./landing-reuse-section";
vi.mock("@/shared/ui/brand/reveal-content/reveal-content", () => ({
  RevealContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("./aceternity-terminal", () => ({
  Terminal: ({ commands }: { commands: string[] }) => (
    <pre>{commands.join("\n")}</pre>
  ),
}));
describe("LandingReuseSection", () => {
  it("describes the implemented platform and links to its screens", () => {
    renderWithIntl(<LandingReuseSection />);
    expect(
      screen.getByRole("heading", {
        name: "AI 생성을 내 서비스에 연결하세요.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /API 문서/ })).toHaveAttribute(
      "href",
      "/api-docs",
    );
    expect(screen.getByText(/POST/)).toHaveTextContent(
      "/api/external/image-generation",
    );
  });
});
