import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GenerationStudioIntro } from "@/shared/ui/generation-studio-intro";

describe("GenerationStudioIntro", () => {
  it("uses compact typography and does not consume the result frame height", () => {
    render(
      <GenerationStudioIntro
        eyebrow="AUDIO STUDIO"
        title="Shape sound with control."
        description="Describe the sound you need."
      />,
    );

    const intro = screen.getByTestId("generation-studio-intro");
    const heading = screen.getByRole("heading", {
      name: "Shape sound with control.",
    });

    expect(intro).not.toHaveClass("min-h-[58vh]");
    expect(intro).not.toHaveClass("h-full");
    expect(heading).toHaveClass("font-display");
    expect(heading).toHaveClass("text-[clamp(2.35rem,4.8vw,5.15rem)]");
    expect(heading).not.toHaveClass("text-[clamp(3.1rem,7vw,7rem)]");
  });
});
