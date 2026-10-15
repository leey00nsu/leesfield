import { copyTextToClipboard } from "./clipboard";

describe("clipboard transport", () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  function stubClipboard(value: unknown) { Object.defineProperty(navigator, "clipboard", { configurable: true, value }); }
  afterEach(() => { if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard); else Reflect.deleteProperty(navigator, "clipboard"); });

  it("copies the exact original text with native clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText } as unknown as Clipboard);
    expect(await copyTextToClipboard("  first\nsecond  ")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("  first\nsecond  ");
  });

  it.each([true, false, "throw"])("cleans fallback textarea and restores focus when copy returns %s", async outcome => {
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) } as unknown as Clipboard);
    const focus = document.createElement("button");
    document.body.appendChild(focus); focus.focus();
    Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn(() => {
      if (outcome === "throw") throw new Error("unsupported");
      return outcome;
    }) });
    expect(await copyTextToClipboard("exact payload")).toBe(outcome === true);
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(focus);
    focus.remove(); delete (document as Partial<Document>).execCommand;
  });

  it("does not copy whitespace", async () => {
    const writeText = vi.fn();
    stubClipboard({ writeText } as unknown as Clipboard);
    expect(await copyTextToClipboard("  ")).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });
});
