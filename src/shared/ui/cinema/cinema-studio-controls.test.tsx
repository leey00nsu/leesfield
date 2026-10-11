import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import ko from "@/shared/i18n/messages/ko.json";
import { defaultCinemaSettings } from "@/shared/cinema/cinema-contract";
import { CinemaStudioControls } from "./cinema-studio-controls";

function expectPhotoPath(image: HTMLElement, expected: string) {
  expect(new URL((image as HTMLImageElement).src, window.location.href).pathname).toBe(expected);
}

function mount(props: Partial<React.ComponentProps<typeof CinemaStudioControls>> = {}) {
  const change = vi.fn();
  function Harness() {
    const [settings, setSettings] = useState<unknown>(props.settings ?? defaultCinemaSettings());
    return <NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul"><CinemaStudioControls media="video" {...props} settings={settings} onChange={next => { change(next); setSettings(next); }} /></NextIntlClientProvider>;
  }
  render(<Harness />);
  return change;
}
describe("Cinema authoring interactions", () => {
  it("can clear retained guidance after switching to a promptless model without enabling its controls", () => {
    const change = mount({ supportsPrompt: false, settings: { ...defaultCinemaSettings(), lighting: "window" } });
    expect(screen.getByRole("button", { name: /^카메라:/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "전체 초기화" }));
    expect(change).toHaveBeenCalledWith(defaultCinemaSettings());
    expect(screen.getByRole("button", { name: /^카메라:/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "전체 초기화" })).not.toBeInTheDocument();
  });
  it("selects a camera with the keyboard and disables the retained shooting values", () => {
    const change = mount({ initialGroup: "shooting" });
    const camera = screen.getByRole("spinbutton", { name: "카메라" });
    fireEvent.keyDown(camera, { key: "ArrowDown" });
    expect(camera).toHaveAttribute("aria-valuetext", "RED V-RAPTOR XL 8K S35");
    fireEvent.click(screen.getByRole("switch"));
    expect(change.mock.calls.at(-1)![0]).toMatchObject({ shootingEnabled: false, camera: "modular-8k" });
    fireEvent.keyDown(camera, { key: "ArrowDown" });
    expect(change).toHaveBeenCalledTimes(2);
  });
  it("selects a palette card and resets all settings", () => {
    const change = mount({ initialGroup: "visual" });
    fireEvent.click(screen.getByRole("button", { name: "쿨 블루" }));
    expect(screen.getByRole("button", { name: "쿨 블루" })).toHaveAttribute("aria-pressed", "true");
    expect(change.mock.calls.at(-1)![0].palette).toBe("cool-blue");
    fireEvent.click(screen.getByRole("button", { name: "전체 초기화" }));
    expect(change.mock.calls.at(-1)![0]).toEqual(defaultCinemaSettings());
  });
  it.each(["visual", "narrative"] as const)("keeps the %s content until its close animation finishes", async initialGroup => {
    let finish!: () => void;
    const finished = new Promise<void>(resolve => { finish = resolve; });
    mount({ initialGroup });
    const dialog = screen.getByRole("dialog");
    const title = initialGroup === "visual" ? "비주얼 스타일" : "내러티브";
    Object.defineProperty(dialog, "getAnimations", { configurable: true, value: () => [{ finished }] });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: title })).toBeInTheDocument();
    expect(within(dialog).queryByRole("spinbutton", { name: "카메라" })).not.toBeInTheDocument();
    await act(async () => { finish(); });
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^카메라:/ }));
    expect(screen.getByRole("dialog", { name: "카메라" })).toBeInTheDocument();
  });
  it("shows shot text and numeric aperture with guides and isolates stale image errors", () => {
    mount({ initialGroup: "shooting", settings: { ...defaultCinemaSettings(), composition: "medium-wide", aperture: "f4" } });
    const shot = screen.getByRole("spinbutton", { name: "구도" });
    const aperture = screen.getByRole("spinbutton", { name: "조리개" });
    expect(shot.querySelector("img")).toBeNull(); expect(aperture.querySelector("img")).toBeNull();
    expect(screen.queryByRole("spinbutton", { name: "초점거리" })).not.toBeInTheDocument();
    expect(shot).toHaveAttribute("aria-valuetext", "중원경");
    expect(shot).toHaveAccessibleDescription("무릎 위부터 담아 동작과 배경을 함께 보여주고 싶을 때");
    const previous = screen.getByRole("img", { name: "카메라 미리보기 · 중원경" });
    fireEvent.keyDown(shot, { key: "ArrowDown" });
    fireEvent.keyDown(shot, { key: "ArrowDown" });
    fireEvent.error(previous);
    expectPhotoPath(screen.getByRole("img", { name: "카메라 미리보기 · 미디엄 클로즈업" }), "/assets/cinema/previews/medium-close-up.webp");
    fireEvent.keyDown(aperture, { key: "Home" });
    expect(screen.getByRole("img", { name: "카메라 미리보기 · 미디엄 클로즈업" })).toBeInTheDocument();
    fireEvent.keyDown(shot, { key: "Home" });
    expect(screen.getByRole("img", { name: "카메라 미리보기 · 전신 샷" })).toBeInTheDocument();
  });
  it.each([["extreme-wide","초원경"],["wide","원경"],["full","전신 샷"],["medium-wide","중원경"],["medium","중간 샷"],["medium-close-up","미디엄 클로즈업"],["close-up","클로즈업"],["extreme-close-up","익스트림 클로즈업"]])("keeps the same %s photo across aperture changes while retaining the selected aperture", (composition, label) => {
    const change = mount({ initialGroup: "shooting", settings: { ...defaultCinemaSettings(), composition, aperture: "f14" } });
    const aperture = screen.getByRole("spinbutton", { name: "조리개" });
    expectPhotoPath(screen.getByRole("img", { name: `카메라 미리보기 · ${label}` }), `/assets/cinema/previews/${composition}.webp`);
    const photo = screen.getByRole("img", { name: `카메라 미리보기 · ${label}` });
    expect(change).not.toHaveBeenCalled();
    fireEvent.keyDown(aperture, { key: "ArrowDown" });
    expectPhotoPath(screen.getByRole("img", { name: `카메라 미리보기 · ${label}` }), `/assets/cinema/previews/${composition}.webp`);
    fireEvent.keyDown(aperture, { key: "ArrowDown" });
    expectPhotoPath(screen.getByRole("img", { name: `카메라 미리보기 · ${label}` }), `/assets/cinema/previews/${composition}.webp`);
    expect(screen.getByRole("img", { name: `카메라 미리보기 · ${label}` })).toBe(photo);
    expect(change.mock.calls.at(-1)![0]).toEqual({ ...defaultCinemaSettings(), composition, aperture: "f11" });
  });
  it("uses a neutral example for Auto/off and keeps hardware out of photo selection", () => {
    const change = mount({ initialGroup: "shooting" });
    expect(change).not.toHaveBeenCalled();
    const shot = screen.getByRole("spinbutton", { name: "구도" });
    fireEvent.keyDown(shot, { key: "End" });
    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "조리개" }), { key: "End" });
    const photo = screen.getByRole("img", { name: "카메라 미리보기 · 익스트림 클로즈업" });
    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "카메라" }), { key: "End" });
    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "렌즈" }), { key: "End" });
    expect(screen.getByRole("img", { name: "카메라 미리보기 · 익스트림 클로즈업" })).toBe(photo);
    fireEvent.click(screen.getByRole("switch"));
    expectPhotoPath(screen.getByRole("img", { name: "카메라 미리보기 · 전신 샷" }), "/assets/cinema/previews/full.webp");
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("img", { name: "카메라 미리보기 · 익스트림 클로즈업" })).toBeInTheDocument();
  });
  it("isolates failures and recovers on selection after the fallback fails", () => {
    const change = mount({ initialGroup: "shooting", settings: { ...defaultCinemaSettings(), composition: "close-up", aperture: "f14" } });
    fireEvent.error(screen.getByRole("img", { name: "카메라 미리보기 · 클로즈업" }));
    expect(screen.getByRole("status")).toHaveTextContent("전신 샷");
    fireEvent.error(screen.getByRole("img", { name: "카메라 미리보기 · 전신 샷" }));
    expect(screen.queryByRole("img", { name: /카메라 미리보기/ })).not.toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "구도" }), { key: "ArrowUp" });
    expectPhotoPath(screen.getByRole("img", { name: "카메라 미리보기 · 미디엄 클로즈업" }), "/assets/cinema/previews/medium-close-up.webp");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("keeps every rapid coverflow step and supports keyboard boundaries and wrapping", () => {
    const change = mount({ initialGroup: "visual" });
    fireEvent.click(screen.getByRole("tab", { name: "아트 스타일" }));
    const next = screen.getByRole("button", { name: "아트 스타일 다음 항목" });
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(next);
    expect(change.mock.calls.map(([settings]) => settings.artStyle)).toEqual(["modern-minimal", "vintage", "film-noir"]);
    const rack = screen.getByRole("region", { name: "아트 스타일" });
    fireEvent.keyDown(rack, { key: "End" });
    expect(change.mock.calls.at(-1)![0].artStyle).toBe("fantasy");
    fireEvent.keyDown(rack, { key: "ArrowRight" });
    expect(change.mock.calls.at(-1)![0].artStyle).toBe("auto");
    fireEvent.keyDown(rack, { key: "ArrowLeft", isComposing: true });
    expect(change).toHaveBeenCalledTimes(5);
  });
  it("prevents readonly coverflow navigation with buttons and keys", () => {
    const change = mount({ initialGroup: "narrative", disabled: true });
    const rack = screen.getByRole("region", { name: "장르" });
    fireEvent.keyDown(rack, { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("button", { name: "장르 다음 항목" }));
    expect(change).not.toHaveBeenCalled();
    expect(rack).toHaveAttribute("tabindex", "-1");
  });
  it("keeps readonly selections and offers explicit recovery for unknown saved settings", () => {
    const change = mount({ disabled: true, initialGroup: "visual" });
    fireEvent.click(screen.getByRole("button", { name: "쿨 블루" }));
    expect(change).not.toHaveBeenCalled();
  });
  it("blocks unsupported settings until reset and hides narrative for images", () => {
    const change = mount({ media: "image", settings: { schemaVersion: 2, camera: "unknown" } });
    expect(screen.queryByRole("button", { name: /^내러티브:/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^카메라:/ })).toBeDisabled();
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "전체 초기화" }));
    expect(change).toHaveBeenCalledWith(defaultCinemaSettings());
    expect(screen.getByRole("button", { name: /^카메라:/ })).not.toBeDisabled();
  });
});
