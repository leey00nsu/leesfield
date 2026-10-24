// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { MediaCropEditor, type CropEdit } from "./media-crop-editor";
afterEach(cleanup);
const asset = { id: "source", width: 400, height: 200, type: "image", url: "/image.png" } as MediaAssetDto;
function Fixture({ video = false, confirm = vi.fn(), cancel = vi.fn() }) {
  const [edit, set] = useState<CropEdit>({ kind: video ? "video.crop" : "image.crop", rect: { x: 100, y: 0, width: 200, height: 200 } });
  const [preset, setPreset] = useState("1:1");
  return <NextIntlClientProvider locale="ko" messages={{}}><MediaCropEditor asset={asset} edit={edit} preset={preset}
    onChange={(next, name = "custom") => { set(next); setPreset(name); }} onConfirm={confirm} onCancel={cancel} /></NextIntlClientProvider>;
}
describe("direct crop controls", () => {
  it("moves source pixels, changes preset to custom and keeps composing Escape local", () => {
    const cancel = vi.fn(), confirm = vi.fn(); render(<Fixture cancel={cancel} confirm={confirm} />);
    const stage = screen.getByRole("group", { name: "이미지 자르기" });
    fireEvent.keyDown(stage, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "비율" }).textContent).toContain("사용자 지정");
    expect(screen.getAllByRole("slider")).toHaveLength(8);
    fireEvent.keyDown(stage, { key: "Escape", isComposing: true }); expect(cancel).not.toHaveBeenCalled();
    fireEvent.keyDown(stage, { key: "Enter" }); expect(confirm).toHaveBeenCalledOnce();
    fireEvent.keyDown(stage, { key: "Escape" }); expect(cancel).toHaveBeenCalledOnce();
  });
  it("video shows dimensions and create with no ratio menu", () => {
    render(<Fixture video />);
    expect(screen.queryByRole("button", { name: "비율" })).toBeNull();
    expect(screen.getByText("200 × 200")).toBeTruthy();
    expect(screen.getByRole("button", { name: "잘라낸 영상 생성" })).toBeTruthy();
  });
});
