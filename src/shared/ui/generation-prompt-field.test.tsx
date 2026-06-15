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
    expect(dock).toHaveAttribute("data-surface", "default");
    expect(dock).toHaveClass("rounded-[1.35rem]");
    expect(dock).toHaveClass("border-0");
    expect(dock.className).toContain("bg-[#0b0d0e]");
    expect(dock.className).not.toContain("gradient");
    expect(surface).toHaveAttribute("data-app-card");
    expect(surface).toHaveAttribute("data-variant", "prompt");
    expect(surface).toHaveClass("relative");
    expect(surface).toHaveClass("rounded-xl");
    expect(surface).toHaveClass("border-white/12");
    expect(surface).toHaveClass("bg-black/18");
    expect(surface).not.toHaveClass("bg-creative-surface");
    expect(screen.getByTestId("shared-prompt-meta")).toHaveTextContent("0 chars");
  });

  it("can wrap the inner prompt content without wrapping the outer prompt field surface", () => {
    renderWithIntl(
      <GenerationPromptField
        testId="prompt-field"
        textarea={<textarea aria-label="Prompt" />}
        contentWrapper={(children) => (
          <div data-testid="prompt-content-wrapper">{children}</div>
        )}
      />,
    );

    const field = screen.getByTestId("prompt-field");
    const wrapper = screen.getByTestId("prompt-content-wrapper");
    const surface = screen.getByTestId("shared-prompt-form-surface");

    expect(field).not.toBe(wrapper);
    expect(field).toContainElement(wrapper);
    expect(wrapper).toContainElement(surface);
  });

  it("renders feedback between the prompt textarea and footer controls", () => {
    renderWithIntl(
      <GenerationPromptField
        textarea={<textarea aria-label="Prompt" />}
        feedback={<p role="alert">Prompt is required</p>}
        footerLeft={<button type="button">Model</button>}
      />,
    );

    const surface = screen.getByTestId("shared-prompt-form-surface");
    const textarea = screen.getByRole("textbox", { name: "Prompt" });
    const feedback = screen.getByRole("alert");
    const footerControl = screen.getByRole("button", { name: "Model" });

    expect(surface).toContainElement(feedback);
    expect(
      textarea.compareDocumentPosition(feedback) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      feedback.compareDocumentPosition(footerControl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
