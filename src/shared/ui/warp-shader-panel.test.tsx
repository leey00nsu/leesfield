import type React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WarpShaderPanel } from "@/shared/ui/warp-shader-panel";

vi.mock("@paper-design/shaders-react", () => ({
  Warp: ({
    style,
  }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => (
    <div data-testid="warp-shader" style={style} />
  ),
}));

describe("WarpShaderPanel", () => {
  it("uses Tailwind opacity animation classes for fade-in", () => {
    render(<WarpShaderPanel className="absolute inset-0" fadeIn />);

    const panel = screen.getByTestId("warp-shader-panel");
    expect(panel).toHaveClass("opacity-75");
    expect(panel).toHaveClass("animate-in");
    expect(panel).toHaveClass("fade-in");
    expect(panel).toHaveClass("duration-1000");
    expect(panel).toHaveClass("delay-150");
    expect(panel).toHaveClass("fill-mode-forwards");
    expect(panel).toHaveClass("motion-reduce:animate-none");
    expect(panel).not.toHaveAttribute("data-visible");
  });
});
