import type React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WarpShaderPanel } from "@/shared/ui/warp-shader-panel";

vi.mock("@paper-design/shaders-react", () => ({
  Warp: ({
    style,
  }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => (
    <div data-testid="warp-shader" style={style} />
  ),
}));

describe("WarpShaderPanel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts hidden and fades in after client mount", () => {
    vi.useFakeTimers();

    render(<WarpShaderPanel className="absolute inset-0" fadeIn />);

    const panel = screen.getByTestId("warp-shader-panel");
    expect(panel).toHaveAttribute("data-visible", "false");
    expect(panel).toHaveClass("opacity-0");
    expect(panel).toHaveClass("scale-[1.02]");

    act(() => {
      vi.advanceTimersByTime(180);
    });

    expect(panel).toHaveAttribute("data-visible", "true");
    expect(panel).toHaveClass("opacity-75");
    expect(panel).toHaveClass("scale-100");
    expect(panel).toHaveClass("motion-reduce:transition-none");
  });
});
