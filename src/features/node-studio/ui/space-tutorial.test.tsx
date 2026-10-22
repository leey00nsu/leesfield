import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test-utils/intl";
import enMessages from "@/shared/i18n/messages/en.json";
import { SpaceTutorial } from "./space-tutorial";
import type { GenerationGraphNodeDto } from "../model/graph-types";

afterEach(() => vi.useRealTimers());
describe("SpaceTutorial", () => {
  it("closes with Escape on a focused tutorial control and respects composing Escape", () => {
    const close = vi.fn();
    renderWithIntl(<SpaceTutorial nodes={[]} edges={[]} onClose={close} />, { locale: "en", messages: enMessages });
    const skip = screen.getByRole("button", { name: "Skip tutorial" });
    skip.focus();
    fireEvent.keyDown(skip, { key: "Escape", isComposing: true });
    expect(close).not.toHaveBeenCalled();
    fireEvent.keyDown(skip, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
  });
  it("waits for real canonical edits and keeps skipping available without generating or modifying data", () => {
    vi.useFakeTimers();
    const close = vi.fn(), nodes: GenerationGraphNodeDto[] = [];
    const view = renderWithIntl(<SpaceTutorial nodes={nodes} edges={[]} onClose={close} />, { locale: "en", messages: enMessages });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Click the Image button to add an image node.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByText("Click the Image button to add an image node.")).toBeInTheDocument();
    const image: GenerationGraphNodeDto = { id: "image", kind: "input.image", configVersion: 1, config: { assetId: null }, selectedOutputAssetId: null, position: { x: 0, y: 0 } };
    view.rerender(<SpaceTutorial nodes={[image]} edges={[]} onClose={close} />);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText(/Each node has a specific function/)).toBeInTheDocument();
    expect(nodes).toEqual([]);
    expect(image.config).toEqual({ assetId: null });
    fireEvent.click(screen.getByRole("button", { name: "Skip tutorial" }));
    expect(close).toHaveBeenCalledOnce();
  });
  it("does not treat Escape from an IME editor or another dialog as a tutorial close", () => {
    const close = vi.fn();
    renderWithIntl(<><input aria-label="editor" /><div role="dialog" aria-label="picker" /><SpaceTutorial nodes={[]} edges={[]} onClose={close} /></>,
      { locale: "en", messages: enMessages });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape", isComposing: true });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
  });
});
