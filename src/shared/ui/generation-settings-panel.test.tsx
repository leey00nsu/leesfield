import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GenerationSettingsPanel } from "@/shared/ui/generation-settings-panel";
import { renderWithIntl } from "@/test-utils/intl";

describe("GenerationSettingsPanel", () => {
  it("renders settings as a compact creative surface without heavy card shadow", () => {
    renderWithIntl(
      <GenerationSettingsPanel onReset={vi.fn()}>
        <div>Controls</div>
      </GenerationSettingsPanel>,
    );

    const heading = screen.getByRole("heading", { name: "설정" });
    const panel = heading.closest("aside");

    expect(heading).toHaveClass("text-sm");
    expect(panel).toHaveClass("bg-creative-surface-muted");
    expect(panel).not.toHaveClass("shadow-2xl");
  });
});
