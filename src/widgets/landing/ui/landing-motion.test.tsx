import type React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LandingReveal, LandingScaleY } from "./landing-motion";

vi.mock("motion/react", () => ({
  motion: {
    div: ({
      children,
      initial,
      transition,
      viewport,
      whileInView,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      initial?: unknown;
      transition?: unknown;
      viewport?: unknown;
      whileInView?: unknown;
    }) => (
      <div
        {...props}
        data-motion-initial={JSON.stringify(initial)}
        data-motion-transition={JSON.stringify(transition)}
        data-motion-viewport={JSON.stringify(viewport)}
        data-motion-while-in-view={JSON.stringify(whileInView)}
      >
        {children}
      </div>
    ),
    span: ({
      children,
      initial,
      transition,
      viewport,
      whileInView,
      ...props
    }: React.HTMLAttributes<HTMLSpanElement> & {
      initial?: unknown;
      transition?: unknown;
      viewport?: unknown;
      whileInView?: unknown;
    }) => (
      <span
        {...props}
        data-motion-initial={JSON.stringify(initial)}
        data-motion-transition={JSON.stringify(transition)}
        data-motion-viewport={JSON.stringify(viewport)}
        data-motion-while-in-view={JSON.stringify(whileInView)}
      >
        {children}
      </span>
    ),
  },
  useReducedMotion: () => false,
}));

describe("LandingMotion", () => {
  it("reveals sections with motion.dev viewport animation", () => {
    render(
      <LandingReveal testId="reveal" delay={0.2} scale={0.98}>
        Content
      </LandingReveal>,
    );

    const reveal = screen.getByTestId("reveal");
    expect(reveal).toHaveAttribute("data-landing-motion", "reveal");
    expect(reveal).toHaveAttribute(
      "data-motion-initial",
      JSON.stringify({ opacity: 0, y: 18, scale: 0.98 }),
    );
    expect(reveal).toHaveAttribute(
      "data-motion-while-in-view",
      JSON.stringify({ opacity: 1, y: 0, scale: 1 }),
    );
    expect(reveal).toHaveAttribute(
      "data-motion-viewport",
      JSON.stringify({ once: true, margin: "-12% 0px" }),
    );
    expect(reveal).toHaveAttribute(
      "data-motion-transition",
      JSON.stringify({
        delay: 0.2,
        duration: 0.62,
        ease: [0.22, 1, 0.36, 1],
      }),
    );
  });

  it("scales preview meter bars from the baseline", () => {
    render(<LandingScaleY testId="bar" className="h-10" delay={0.1} />);

    const bar = screen.getByTestId("bar");
    expect(bar).toHaveAttribute("data-landing-motion", "scale-y");
    expect(bar).toHaveClass("origin-bottom");
    expect(bar).toHaveAttribute(
      "data-motion-initial",
      JSON.stringify({ opacity: 0, scaleY: 0.18 }),
    );
    expect(bar).toHaveAttribute(
      "data-motion-while-in-view",
      JSON.stringify({ opacity: 1, scaleY: 1 }),
    );
  });
});
