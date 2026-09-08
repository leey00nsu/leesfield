import type React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WarpShaderPanel } from "@/shared/ui/warp-shader-panel";

vi.mock("@paper-design/shaders-react", () => ({
  Warp: ({
    style,
    ...config
  }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => (
    <div
      data-testid="warp-shader"
      data-config={JSON.stringify(config)}
      style={style}
    />
  ),
}));

describe("WarpShaderPanel", () => {
  it("preserves the Warp shape and stops time in reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    render(<WarpShaderPanel />);
    const config = JSON.parse(
      screen.getByTestId("warp-shader").getAttribute("data-config") ?? "{}",
    );
    expect(config).toMatchObject({
      proportion: 0.45,
      softness: 1,
      distortion: 0.25,
      swirl: 0.8,
      swirlIterations: 10,
      shape: "checks",
      shapeScale: 0.1,
      scale: 1,
      rotation: 0,
      speed: 0,
    });
    vi.unstubAllGlobals();
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

  it("uses Motion for fade-in without CSS timeline", () => {
    render(<WarpShaderPanel className="absolute inset-0" fadeIn />);

    const panel = screen.getByTestId("warp-shader-panel");
    expect(panel).not.toHaveClass("opacity-75");
    expect(panel).not.toHaveClass("animate-in");
    expect(panel).not.toHaveClass("fade-in");
    expect(panel).not.toHaveClass("duration-1000");
    expect(panel).not.toHaveClass("delay-150");
    expect(panel).not.toHaveClass("fill-mode-forwards");
    expect(panel).not.toHaveClass("motion-reduce:animate-none");
    expect(panel).not.toHaveAttribute("data-visible");
  });

  it("keeps shader styling with Motion fade", () => {
    render(<WarpShaderPanel className="absolute inset-0" fadeIn />);

    const panel = screen.getByTestId("warp-shader-panel");
    expect(panel).not.toHaveClass("animate-in");
    expect(panel).not.toHaveClass("fade-in");
    expect(panel).toHaveClass("bg-[#07090a]");
    expect(screen.getByTestId("warp-shader-layer")).toHaveClass("opacity-100");
  });
});
