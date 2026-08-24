import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { resolveImageAuthoringDefaults } from "@/shared/generation/image-authoring";
import { runtimeImageModelsFixture } from "@/test-utils/fixtures/runtime-model-catalog";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { ImageNodeParameterControls } from "./image-node-parameter-controls";

describe("ImageNodeParameterControls", () => {
  const model = runtimeImageModelsFixture[0]!;
  const values = resolveImageAuthoringDefaults(model, "prompt");

  it("updates image count with the catalog range", async () => {
    const countModel = {
      ...model,
      parameters: {
        ...model.parameters,
        imageCount: { ui: "range", min: 1, max: 4, step: 1, default: 1 },
      },
    };
    const countValues = resolveImageAuthoringDefaults(countModel, "prompt");
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ImageNodeParameterControls
        model={countModel}
        values={countValues}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /imageCount/i }));
    await user.click(screen.getByRole("button", { name: "increase" }));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        parameters: expect.objectContaining({ imageCount: countValues.imageCount + 1 }),
      }),
    );
  });

  it("stores ratio presets as canonical width and height only", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ImageNodeParameterControls model={model} values={values} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /outputSize/i }));
    await user.click(screen.getByRole("button", { name: "16:9" }));

    const next = onChange.mock.calls.at(-1)?.[0];
    expect(next.parameters.width).toEqual(expect.any(Number));
    expect(next.parameters.height).toEqual(expect.any(Number));
    expect(next.parameters).not.toHaveProperty("aspectRatio");
  });

  it("keeps invalid numeric input local and does not publish it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ImageNodeParameterControls model={model} values={values} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /outputSize/i }));
    const width = screen.getByRole("spinbutton", { name: "width" });
    fireEvent.change(width, { target: { value: "" } });

    expect(width).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("node.invalidParameter")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders only catalog-backed advanced controls", async () => {
    const advancedModel =
      runtimeImageModelsFixture.find(
        (item) => item.parameters.steps?.ui !== "hidden",
      ) ?? model;
    const advancedValues = resolveImageAuthoringDefaults(advancedModel, "prompt");
    const user = userEvent.setup();
    render(
      <ImageNodeParameterControls
        model={advancedModel}
        values={advancedValues}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /settings/i }));
    expect(screen.getByRole("spinbutton", { name: "steps" })).toBeInTheDocument();
  });
});
