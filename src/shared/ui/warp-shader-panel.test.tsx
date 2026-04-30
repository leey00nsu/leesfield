import type React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  markClientShellHydrated,
  resetClientShellHydrationForTests,
} from "@/shared/lib/client-navigation-state";
import { WarpShaderPanel } from "@/shared/ui/warp-shader-panel";

vi.mock("@paper-design/shaders-react", () => ({
  Warp: ({
    style,
  }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => (
    <div data-testid="warp-shader" style={style} />
  ),
}));

describe("WarpShaderPanel", () => {
  beforeEach(() => {
    resetClientShellHydrationForTests();
  });

  it("masks a white shader first frame without hiding the shader colors", () => {
    render(<WarpShaderPanel className="absolute inset-0" fadeIn />);

    const panel = screen.getByTestId("warp-shader-panel");
    expect(panel).toHaveClass("bg-[#07090a]");
    expect(panel).toHaveClass("isolate");
    expect(panel).toHaveClass("overflow-hidden");

    const shaderLayer = screen.getByTestId("warp-shader-layer");
    expect(shaderLayer).toHaveClass("opacity-100");
    expect(shaderLayer).not.toHaveClass("mix-blend-multiply");

    const scrim = screen.getByTestId("warp-shader-scrim");
    expect(scrim).toHaveClass("bg-[#07090a]/35");
  });

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

  it("can keep the first load fade without replaying it after client navigation", () => {
    markClientShellHydrated();

    render(
      <WarpShaderPanel
        className="absolute inset-0"
        fadeIn
        fadeInOnInitialLoadOnly
      />,
    );

    const panel = screen.getByTestId("warp-shader-panel");
    expect(panel).not.toHaveClass("animate-in");
    expect(panel).not.toHaveClass("fade-in");
    expect(panel).toHaveClass("bg-[#07090a]");
    expect(screen.getByTestId("warp-shader-layer")).toHaveClass("opacity-100");
  });
});
