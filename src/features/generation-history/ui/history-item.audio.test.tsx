import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryItem } from "@/features/generation-history/ui/history-item";
import { renderWithIntl } from "@/test-utils/intl";

const mockPush = vi.hoisted(() => vi.fn());
const mockToastSuccess = vi.hoisted(() => vi.fn());
const originalClipboard = window.navigator.clipboard;

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: mockToastSuccess,
    error: vi.fn(),
  },
}));

describe("HistoryItem audio", () => {
  afterEach(() => {
    mockToastSuccess.mockReset();
    vi.restoreAllMocks();
    if (originalClipboard) {
      Object.defineProperty(window.navigator, "clipboard", {
        value: originalClipboard,
        configurable: true,
      });
    } else {
      // @ts-expect-error - cleanup optional test stub
      delete window.navigator.clipboard;
    }
  });

  it("audio 항목은 /audio 재사용 경로와 오디오 프리뷰를 사용한다", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <HistoryItem
        item={{
          id: "item-audio-1",
          type: "audio" as never,
          status: "completed",
          prompt: "hello audio",
          model: "qwen-tts",
          createdAt: "2026-02-03T00:00:00.000Z",
          resultUrl: "https://example.com/result.mp3",
          thumbnailUrl: null,
          inputAudios: ["data:audio/wav;base64,UklGRg=="],
          referenceText: "reference words",
          errorMessage: null,
        }}
      />,
    );

    expect(document.querySelector("audio")).not.toBeNull();
    expect(
      document.querySelector(
        'a[href="/api/audio-generation/item-audio-1/download?index=0"]',
      ),
    ).not.toBeNull();
    const reuseButton = screen.getByRole("button", { name: "프롬프트 재사용" });
    const downloadLink = screen.getByRole("link", { name: "다운로드" });
    const copyButton = screen.getByRole("button", { name: "프롬프트 복사" });
    const openLink = screen.getByRole("link", { name: "열기" });

    expect(reuseButton.closest(".absolute.inset-0")).toBeNull();
    expect(downloadLink).toHaveTextContent("다운로드");
    expect(reuseButton).not.toHaveTextContent("프롬프트 재사용");

    await user.tab();
    expect(screen.getByRole("button", { name: "더보기" })).toHaveFocus();
    await user.tab();
    expect(downloadLink).toHaveFocus();
    await user.tab();
    expect(reuseButton).toHaveFocus();
    expect(
      (await screen.findAllByRole("tooltip", { hidden: true })).some((tooltip) =>
        tooltip.textContent?.includes("프롬프트 재사용"),
      ),
    ).toBe(true);

    await user.tab();
    expect(copyButton).toHaveFocus();
    expect(
      (await screen.findAllByRole("tooltip", { hidden: true })).some((tooltip) =>
        tooltip.textContent?.includes("프롬프트 복사"),
      ),
    ).toBe(true);

    await user.click(copyButton);
    expect(mockToastSuccess).toHaveBeenCalledWith("복사됨");

    await user.tab();
    expect(openLink).toHaveFocus();
    expect(
      (await screen.findAllByRole("tooltip", { hidden: true })).some((tooltip) =>
        tooltip.textContent?.includes("열기"),
      ),
    ).toBe(true);

    await user.click(reuseButton);

    expect(mockPush).toHaveBeenCalledWith(
      "/audio?prompt=hello+audio&model=qwen-tts&referenceText=reference+words",
    );
  });

  it("clipboard fallback이 false를 반환하면 복사 성공 상태를 표시하지 않는다", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window.navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("clipboard unavailable")),
      },
      configurable: true,
    });
    const execCommandSpy = vi.fn().mockReturnValue(false);
    Object.defineProperty(document, "execCommand", {
      value: execCommandSpy,
      configurable: true,
    });

    renderWithIntl(
      <HistoryItem
        item={{
          id: "item-audio-2",
          type: "audio" as never,
          status: "completed",
          prompt: "copy me",
          model: "qwen-tts",
          createdAt: "2026-02-03T00:00:00.000Z",
          resultUrl: "https://example.com/result.mp3",
          thumbnailUrl: null,
          inputAudios: [],
          referenceText: null,
          errorMessage: null,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "프롬프트 복사" }));

    expect(execCommandSpy).toHaveBeenCalledWith("copy");
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "프롬프트 복사" })).toBeTruthy();
  });
});
