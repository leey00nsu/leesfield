import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GenerationPromptField } from "@/shared/ui/generation-prompt-field";
import { renderWithIntl } from "@/test-utils/intl";

describe("GenerationPromptField", () => {
  it("uses a subdued creative surface instead of a heavy lime glow", () => {
    renderWithIntl(
      <GenerationPromptField
        textarea={<textarea aria-label="Prompt" />}
        footerLeft={<span>Attach</span>}
        footerRight={<span>0 chars</span>}
      />,
    );

    const textarea = screen.getByLabelText("Prompt");
    const surface = textarea.closest(".relative.rounded-xl");
    const glow = surface?.previousElementSibling;

    expect(surface).toHaveClass("bg-creative-surface");
    expect(glow).toHaveClass("from-primary/10");
    expect(glow).not.toHaveClass("from-primary/30");
  });
});
