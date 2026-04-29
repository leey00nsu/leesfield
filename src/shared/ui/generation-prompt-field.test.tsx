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
        footerLeft={<span>Attach</span>}
        footerRight={<span>0 chars</span>}
      />,
    );

    const dock = screen.getByRole("region", {
      name: "작업 입력",
    });
    const surface = screen.getByTestId("generation-form-surface");

    expect(dock).toHaveClass("lf-editorial-panel");
    expect(dock).toHaveClass("rounded-[1.35rem]");
    expect(surface).toHaveClass("relative");
    expect(surface).toHaveClass("rounded-xl");
    expect(surface).toHaveClass("border-white/12");
    expect(surface).toHaveClass("bg-black/18");
    expect(surface).not.toHaveClass("bg-creative-surface");
  });
});
