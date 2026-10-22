import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NodeTextEditor } from "./node-text-editor";
afterEach(cleanup);
describe("canvas text activation", () => {
  it("keeps IME confirmation and repeated key events from activating text editing", () => {
    const { container } = render(<NodeTextEditor label="Edit prompt">{editing => <textarea readOnly={!editing} />}</NodeTextEditor>);
    const display = screen.getByRole("button", { name: "Edit prompt" });
    fireEvent.keyDown(display, { key: "Enter", isComposing: true });
    fireEvent.keyDown(display, { key: " ", keyCode: 229 });
    fireEvent.keyDown(display, { key: "Enter", repeat: true });
    expect(container.querySelector("[data-editing]")?.getAttribute("data-editing")).toBe("false");
    fireEvent.keyDown(display, { key: "Enter" });
    expect(container.querySelector("[data-editing]")?.getAttribute("data-editing")).toBe("true");
  });
});
