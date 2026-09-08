import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HistoryItem } from "@/features/generation-history/ui/history-item";
import { renderWithIntl } from "@/test-utils/intl";

describe("HistoryItem video", () => {
  it("renders a video tile without inline player controls or reuse buttons", async () => {
    let notify: IntersectionObserverCallback = () => {};
    vi.stubGlobal("IntersectionObserver", class { constructor(cb: IntersectionObserverCallback) { notify = cb; } observe() {} disconnect() {} });
    const user = userEvent.setup();
    const onSelect = vi.fn();

    const play=vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue();
    const pause=vi.spyOn(HTMLMediaElement.prototype,"pause").mockImplementation(()=>{});
    const view=renderWithIntl(
      <HistoryItem
        item={{
          id: "item-video-1",
          type: "video" as never,
          status: "completed",
          prompt: "hello video",
          model: "wan-video",
          createdAt: "2026-02-03T00:00:00.000Z",
          resultUrl: "https://example.com/result.mp4",
          thumbnailUrl: null,
          inputImages: ["https://example.com/init.png"],
          errorMessage: null,
        }}
        onSelect={onSelect}
      />,
    );

    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).not.toHaveAttribute("controls");
    expect(video).not.toHaveAttribute("autoplay");
    act(() => notify([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(video).toHaveAttribute("autoplay");
    expect(video?.muted).toBe(true);
    expect(play).toHaveBeenCalled();
    act(() => notify([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(video).not.toHaveAttribute("autoplay");
    expect(pause).toHaveBeenCalled();
    expect(screen.getByText("비디오")).toBeInTheDocument();
    expect(screen.getByText("완료")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "프롬프트 재사용" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "다운로드" })).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /결과 상세 보기: hello video/ }),
    );
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "item-video-1" }));
    view.rerender(<HistoryItem autoplay={false} item={{id:"item-video-1",type:"video",status:"completed",prompt:"hello video",model:"wan-video",createdAt:"2026-02-03",resultUrl:"https://example.com/result.mp4",thumbnailUrl:null,errorMessage:null}} />);
    expect(document.querySelector("video")).not.toHaveAttribute("autoplay");expect(pause).toHaveBeenCalled();play.mockRestore();pause.mockRestore();vi.unstubAllGlobals();
  });
});
