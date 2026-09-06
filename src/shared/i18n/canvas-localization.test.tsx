import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NodeSearchMenu } from "@node-banana-runtime/../components/NodeSearchMenu";
import { KeyboardShortcutsDialog } from "@node-banana-runtime/../components/KeyboardShortcutsDialog";
import { AppCanvasLocalizationProvider } from "./canvas-localization-provider";
import { renderWithIntl } from "@/test-utils/intl";
import enMessages from "./messages/en.json";

describe("canvas application locale bridge", () => {
  it.each(["ko", "en"] as const)("renders actual runtime shortcuts in %s", (locale) => {
    renderWithIntl(
      <AppCanvasLocalizationProvider>
        <KeyboardShortcutsDialog isOpen hosted onClose={vi.fn()} />
      </AppCanvasLocalizationProvider>,
      locale === "en" ? { locale, messages: enMessages } : undefined,
    );
    expect(screen.getByText(locale === "ko" ? "선택한 노드 복사" : "Copy selected nodes")).toBeInTheDocument();
    expect(screen.getAllByText("Ctrl")[0]).toBeInTheDocument();
  });

  it("searches translated labels and retains the canonical node identifier", () => {
    const onSelect = vi.fn();
    renderWithIntl(
      <AppCanvasLocalizationProvider>
        <NodeSearchMenu position={{ x: 0, y: 0 }} onClose={vi.fn()} onSelect={vi.fn()}
          hosted={{ hostedOptions: [{ type: "imageInput", label: "Image Input" }, { type: "videoInput", label: "Video Input" }], onHostedSelect: onSelect }} />
      </AppCanvasLocalizationProvider>,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "노드 검색" }), { target: { value: "이미지" } });
    expect(screen.queryByText("비디오 입력")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("이미지 입력"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ type: "imageInput" }));
  });
});
