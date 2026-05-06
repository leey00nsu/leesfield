import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { generationPresets } from "@/shared/generation/generation-presets";
import { GenerationPresetStrip } from "@/shared/ui/generation-preset-strip";
import { renderWithIntl } from "@/test-utils/intl";

describe("GenerationPresetStrip", () => {
  it("renders keyboard-focusable presets and passes localized prompt on selection", async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();

    renderWithIntl(
      <GenerationPresetStrip
        modality="image"
        items={generationPresets.image}
        onSelect={handleSelect}
      />,
    );

    const strip = screen.getByRole("region", { name: "이미지 시작점" });
    const presetButtons = screen.getAllByRole("button");

    expect(presetButtons).toHaveLength(3);
    expect(strip).toContainElement(presetButtons[0]);

    await user.click(screen.getByRole("button", { name: /에디토리얼 컷/ }));

    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "editorial-cut", modality: "image" }),
      "high contrast editorial portrait, reflective fabric, precise studio lighting",
    );
  });
});
