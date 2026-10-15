import { act, renderHook } from "@testing-library/react";
import { createIntlWrapper, renderWithIntl } from "@/test-utils/intl";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { CodeBlock, CodeBlockCopyButton } from "./app-code-block";
import { useClipboardCopy } from "./use-clipboard-copy";

const copyMock = vi.hoisted(() => vi.fn());
const toasts = vi.hoisted(() => ({ copied: vi.fn(), error: vi.fn() }));
vi.mock("@/shared/lib/clipboard", () => ({ copyTextToClipboard: copyMock }));
vi.mock("@/shared/ui/app-toast", () => ({ appToast: toasts }));
beforeEach(() => { copyMock.mockReset(); toasts.copied.mockReset(); toasts.error.mockReset(); });

describe("toast-only copy", () => {
  it("toasts once per repeated copy without altering the original payload", async () => {
    copyMock.mockResolvedValue(true);
    const { result } = renderHook(useClipboardCopy, { wrapper: createIntlWrapper() });
    await act(async () => { await result.current(" x\ny "); await result.current(" x\ny "); });
    expect(copyMock).toHaveBeenNthCalledWith(2, " x\ny ");
    expect(toasts.copied.mock.calls).toEqual([["복사됨"], ["복사됨"]]);
    expect(toasts.error).not.toHaveBeenCalled();
  });
  it.each(["false", "throw"])("toasts copy failure %s", async failure => {
    if (failure === "throw") copyMock.mockRejectedValue(new Error("private data"));
    else copyMock.mockResolvedValue(false);
    const { result } = renderHook(useClipboardCopy, { wrapper: createIntlWrapper() });
    await act(async () => expect(await result.current("value")).toBe(false));
    expect(toasts.error).toHaveBeenCalledOnce();
    expect(toasts.error).toHaveBeenCalledWith("복사하지 못했습니다.");
    expect(toasts.copied).not.toHaveBeenCalled();
  });
  it.each([true, false])("suppresses a late copy result %s from a dismissed key lifecycle", async copied => {
    let complete!: (result: boolean) => void;
    let current = true;
    copyMock.mockImplementation(() => new Promise<boolean>(resolve => { complete = resolve; }));
    const { result } = renderHook(useClipboardCopy, { wrapper: createIntlWrapper() });
    const pending = result.current("one-time-key", { isCurrent: () => current });
    current = false; complete(copied);
    expect(await pending).toBe(false);
    expect(toasts.copied).not.toHaveBeenCalled();
    expect(toasts.error).not.toHaveBeenCalled();
  });
  it("keeps the common code copy button stable and reports failure through its callback and toast", async () => {
    const onCopy = vi.fn(), onError = vi.fn();
    copyMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    renderWithIntl(<CodeBlock data={[{ filename: "sample.txt", language: "text", code: "  original\ncode " }]} defaultValue="text"><CodeBlockCopyButton onCopy={onCopy} onError={onError} /></CodeBlock>);
    const button = screen.getByRole("button", { name: "복사" });
    const icon = button.innerHTML;
    fireEvent.click(button);
    await waitFor(() => expect(onCopy).toHaveBeenCalledOnce());
    expect(copyMock).toHaveBeenCalledWith("  original\ncode ");
    expect(button.innerHTML).toBe(icon);
    fireEvent.click(button);
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({message:"CLIPBOARD_COPY_FAILED"})));
    expect(toasts.error).toHaveBeenCalledOnce();
    expect(button.innerHTML).toBe(icon);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
