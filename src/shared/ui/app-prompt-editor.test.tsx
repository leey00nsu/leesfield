import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppPromptEditor } from "./app-prompt-editor";
import { NodeTextEditor } from "./node-text-editor";

function setup(value = "after") {
  const change = vi.fn();
  const token = { id: "preset", label: "Preset", content: <span>Preset</span> };
  const view = render(<AppPromptEditor aria-label="Prompt" value={value} token={token} onChange={change} />);
  const editor = screen.getByRole("textbox");
  const chip = editor.querySelector("[data-prompt-token]")!;
  return { ...view, change, editor, chip, token };
}
function select(node: Node, at: number, endNode = node, endAt = at) {
  const range = document.createRange(); range.setStart(node, at); range.setEnd(endNode, endAt);
  const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
}
describe("inline prompt token editing", () => {
  it("hides the empty placeholder during the first IME composition without publishing unfinished text", () => {
    const change = vi.fn();
    render(<AppPromptEditor aria-label="Prompt" value="" placeholder="무엇을 만들고 싶으세요?" onChange={change} />);
    const editor = screen.getByRole("textbox");
    expect(editor).toHaveAttribute("data-empty", "true");
    fireEvent.compositionStart(editor);
    expect(editor).toHaveAttribute("data-empty", "false");
    editor.firstChild!.textContent = "ㅎ";
    fireEvent.input(editor, { isComposing: true, inputType: "insertCompositionText" });
    expect(editor).toHaveAttribute("data-empty", "false");
    expect(change).not.toHaveBeenCalled();
    fireEvent.compositionEnd(editor);
    expect(change).toHaveBeenLastCalledWith("ㅎ", false, 0);
    editor.firstChild!.textContent = "";
    fireEvent.input(editor);
    expect(editor).toHaveAttribute("data-empty", "true");
  });
  it("restores the placeholder when an empty IME composition is cancelled", () => {
    render(<AppPromptEditor aria-label="Prompt" value="" placeholder="Prompt" onChange={vi.fn()} />);
    const editor = screen.getByRole("textbox");
    fireEvent.compositionStart(editor); fireEvent.compositionEnd(editor);
    expect(editor).toHaveAttribute("data-empty", "true");
  });
  it("removes a movement atom independently of a preset without putting chip labels in source text", () => {
    const change = vi.fn();
    render(<AppPromptEditor aria-label="Prompt" value="before after"
      token={{ id: "preset", label: "Preset", offset: 7, content: <span>Preset</span> }}
      tokens={[{ id: "cinema:movement", label: "Snorricam", offset: 12, content: <span>Snorricam</span> }]}
      onChange={change} />);
    const editor = screen.getByRole("textbox");
    const movement = editor.querySelector('[data-prompt-token="cinema:movement"]')!;
    const range = document.createRange(); range.setStartAfter(movement); range.collapse(true);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    fireEvent.keyDown(editor, { key: "Backspace" });
    expect(movement.isConnected).toBe(false);
    expect(editor.querySelector('[data-prompt-token="preset"]')).not.toBeNull();
    expect(change).toHaveBeenLastCalledWith("before after", true, 7, [{ id: "preset", offset: 7 }]);
  });
  it("keeps node text draggable until click, preserves composing Escape, and returns to display on Escape", () => {
    const change = vi.fn();
    render(<NodeTextEditor label="Edit prompt">{editing =>
      <AppPromptEditor aria-label="Node prompt" value="한글" disabled={!editing} onChange={change} />
    }</NodeTextEditor>);
    const display = screen.getByRole("button", { name: "Edit prompt" });
    const root = display.parentElement!;
    expect(root).not.toHaveClass("nodrag");
    expect(screen.getByRole("textbox")).toHaveAttribute("contenteditable", "false");
    fireEvent.click(display);
    expect(root).toHaveClass("nodrag");
    expect(screen.getByRole("textbox")).toHaveAttribute("contenteditable", "true");
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape", isComposing: true });
    expect(root).toHaveAttribute("data-editing", "true");
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(root).toHaveAttribute("data-editing", "false");
    expect(change).not.toHaveBeenCalled();
  });
  it.each(["Backspace", "Delete"])("removes the adjacent token with %s and preserves unselected text", key => {
    const { editor, chip, change } = setup();
    select(editor, key === "Backspace" ? 2 : 1);
    fireEvent.keyDown(editor, { key });
    expect(chip.isConnected).toBe(false);
    expect(change).toHaveBeenLastCalledWith("after", false, 0);
  });
  it("reads text before and after a token without serializing its UI", () => {
    const { editor, chip, change } = setup();
    editor.insertBefore(document.createTextNode("before "), chip);
    fireEvent.input(editor);
    expect(change).toHaveBeenLastCalledWith("before after", true, 7);
  });
  it("reports browser range deletion of a token and only the selected sentence", () => {
    const { editor, chip, change } = setup("after remains");
    const text = chip.nextSibling!;
    select(editor, 1, text, 6);
    window.getSelection()!.getRangeAt(0).deleteContents();
    fireEvent.input(editor);
    expect(change).toHaveBeenLastCalledWith("remains", false, 0);
  });
  it("pastes only plain text over a selection containing a token", () => {
    const { editor, change } = setup();
    select(editor, 0, editor, editor.childNodes.length);
    fireEvent.paste(editor, { clipboardData: { getData: (format: string) => format === "text/plain" ? "<b>plain</b>\n한국어" : "<img src=x onerror=alert(1)>" } });
    expect(change).toHaveBeenLastCalledWith("<b>plain</b>\n한국어", false, 0);
    expect(editor.querySelector("b,img")).toBeNull();
  });
  it("does not publish or delete a token during composition and flushes once at the end", () => {
    const { editor, chip, change } = setup();
    select(editor, 2); fireEvent.compositionStart(editor);
    fireEvent.keyDown(editor, { key: "Backspace", isComposing: true });
    expect(chip.isConnected).toBe(true);
    chip.nextSibling!.textContent = "한글";
    fireEvent.input(editor);
    expect(change).not.toHaveBeenCalled();
    fireEvent.compositionEnd(editor);
    expect(change).toHaveBeenCalledExactlyOnceWith("한글", true, 0);
  });
  it("projects an external text replacement and clears a removed token", () => {
    const { rerender, change } = setup();
    rerender(<AppPromptEditor aria-label="Prompt" value="history text" onChange={change} />);
    expect(screen.getByRole("textbox")).toHaveTextContent("history text");
    expect(screen.getByRole("textbox").querySelector("[data-prompt-token]")).toBeNull();
    expect(change).not.toHaveBeenCalled();
  });
});
