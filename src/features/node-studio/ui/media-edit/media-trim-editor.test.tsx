// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { MediaTrimEditor, type TrimEdit } from "./media-trim-editor";
vi.mock("../../hook/use-space-filmstrip", () => ({ useSpaceFilmstrip: () => ({ status: "ready", images: [] }) }));
afterEach(cleanup);
function Fixture({ cancel = vi.fn(), confirm = vi.fn() }) {
  const [edit, set] = useState<TrimEdit>({ kind: "video.trim", startMs: 0, endMs: 1333 });
  return <NextIntlClientProvider locale="ko" messages={{}}><MediaTrimEditor asset={{ id: "video", url: "/video.mp4", durationMs: 4000 } as MediaAssetDto}
    edit={edit} onChange={set} onCancel={cancel} onConfirm={confirm} /></NextIntlClientProvider>;
}
describe("direct trim bar", () => {
  it("starts with snap off/loop on and adjusts the displayed range through keys", () => {
    const cancel = vi.fn(), confirm = vi.fn(); render(<Fixture cancel={cancel} confirm={confirm} />);
    const bar = screen.getByRole("toolbar");
    expect(screen.getByRole("button", { name: "초 단위 스냅" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "구간 반복" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(bar, { key: "ArrowDown" }); expect(screen.getByText("1.43s")).toBeTruthy();
    fireEvent.keyDown(bar, { key: "ArrowDown", shiftKey: true }); expect(screen.getByText("1.44s")).toBeTruthy();
    fireEvent.keyDown(bar, { key: "ArrowDown", ctrlKey: true }); expect(screen.getByText("2.44s")).toBeTruthy();
    fireEvent.keyDown(bar, { key: "ArrowRight" }); expect(screen.getByRole("slider", { name: "구간 시작" }).getAttribute("aria-valuenow")).toBe("100");
    expect(screen.queryByRole("spinbutton")).toBeNull();
    fireEvent.keyDown(bar, { key: "Escape", isComposing: true }); expect(cancel).not.toHaveBeenCalled();
    fireEvent.keyDown(bar, { key: "Enter" }); expect(confirm).toHaveBeenCalledOnce();
    fireEvent.keyDown(bar, { key: "Escape" }); expect(cancel).toHaveBeenCalledOnce();
  });
});
