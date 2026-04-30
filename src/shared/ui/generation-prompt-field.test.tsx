import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GenerationPromptField } from "@/shared/ui/generation-prompt-field";
import { renderWithIntl } from "@/test-utils/intl";

describe("GenerationPromptField", () => {
  it("uses the same editorial form surface as the landing hero preview", () => {
    renderWithIntl(
      <GenerationPromptField
        ariaLabel="작업 입력"
        textarea={<textarea aria-label="Prompt" />}
        promptMeta={<span>0 chars</span>}
        footerLeft={<span>Attach</span>}
        footerRight={<span>Generate</span>}
      />,
    );

    const dock = screen.getByRole("region", {
      name: "작업 입력",
    });
    const surface = screen.getByTestId("shared-prompt-form-surface");

    expect(dock).toHaveAttribute("data-app-prompt-field");
    expect(dock).toHaveAttribute("data-app-card");
    expect(dock).toHaveAttribute("data-variant", "editorial-flat");
    expect(dock).toHaveClass("rounded-[1.35rem]");
    expect(dock).toHaveClass("border-0");
    expect(dock.className).toContain("[background:radial-gradient");
    expect(dock.className).toContain("linear-gradient");
    expect(surface).toHaveAttribute("data-app-card");
    expect(surface).toHaveAttribute("data-variant", "prompt");
    expect(surface).toHaveClass("relative");
    expect(surface).toHaveClass("rounded-xl");
    expect(surface).toHaveClass("border-white/12");
    expect(surface).toHaveClass("bg-black/18");
    expect(surface).not.toHaveClass("bg-creative-surface");
    expect(screen.getByTestId("shared-prompt-meta")).toHaveTextContent("0 chars");
  });
});
