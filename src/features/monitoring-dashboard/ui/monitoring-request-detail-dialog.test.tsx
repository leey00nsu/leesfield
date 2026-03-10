import "@testing-library/jest-dom/vitest";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MonitoringRequestDetailDialog } from "@/features/monitoring-dashboard/ui/monitoring-request-detail-dialog";
import { renderWithIntl } from "@/test-utils/intl";

const mockUseMonitoringRequestDetail = vi.fn();

vi.mock("@/features/monitoring-dashboard/hook/use-monitoring-dashboard", () => ({
  useMonitoringRequestDetail: (...args: unknown[]) => mockUseMonitoringRequestDetail(...args),
}));

describe("MonitoringRequestDetailDialog", () => {
  beforeEach(() => {
    mockUseMonitoringRequestDetail.mockReset();
  });

  it("seed와 fetched가 모두 없으면 loading 상태를 그대로 노출한다", () => {
    mockUseMonitoringRequestDetail.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    renderWithIntl(
      <MonitoringRequestDetailDialog
        open
        onOpenChange={vi.fn()}
        request={{
          id: "req-1",
          type: "video" as never,
          status: "processing",
          model: "wan-2.2",
          createdAt: "2026-01-10T10:00:00.000Z",
          durationMs: null,
          apiKeyLabel: "UI",
        }}
        timeZone="UTC"
      />,
    );

    expect(screen.getByTestId("monitoring-detail-loading")).toBeInTheDocument();
    expect(screen.queryByText("요청 상세를 불러오지 못했습니다.")).not.toBeInTheDocument();
  });

  it("seed와 fetched가 모두 없으면 fetch error를 그대로 노출한다", () => {
    mockUseMonitoringRequestDetail.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error("boom"),
    });

    renderWithIntl(
      <MonitoringRequestDetailDialog
        open
        onOpenChange={vi.fn()}
        request={{
          id: "req-2",
          type: "video" as never,
          status: "failed",
          model: "wan-2.2",
          createdAt: "2026-01-10T10:00:00.000Z",
          durationMs: null,
          apiKeyLabel: "UI",
        }}
        timeZone="UTC"
      />,
    );

    expect(screen.getByText("요청 상세를 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.queryByTestId("monitoring-detail-loading")).not.toBeInTheDocument();
  });

  it("partial seed가 있어도 상세 조회로 duration/progress/asset duration을 보강한다", () => {
    mockUseMonitoringRequestDetail.mockReturnValue({
      data: {
        id: "vid-1",
        type: "video",
        status: "processing",
        model: "wan-2.2",
        prompt: "full prompt",
        createdAt: "2026-01-10T10:00:00.000Z",
        updatedAt: "2026-01-10T10:00:03.000Z",
        durationMs: 2500,
        progress: 75,
        errorMessage: null,
        warningMessage: null,
        inputImages: ["https://example.com/input.png"],
        inputAudios: [],
        referenceText: null,
        assets: [
          {
            url: "https://example.com/video.mp4",
            width: 1280,
            height: 720,
            durationSec: 4,
          },
        ],
      },
      isLoading: false,
      error: null,
    });

    renderWithIntl(
      <MonitoringRequestDetailDialog
        open
        onOpenChange={vi.fn()}
        request={{
          id: "vid-1",
          type: "video" as never,
          status: "processing",
          model: "wan-2.2",
          createdAt: "2026-01-10T10:00:00.000Z",
          durationMs: null,
          apiKeyLabel: "UI",
        }}
        timeZone="UTC"
        detailOverride={{
          id: "vid-1",
          type: "video" as never,
          status: "processing",
          model: "wan-2.2",
          prompt: "seed prompt",
          createdAt: "2026-01-10T10:00:00.000Z",
          updatedAt: "2026-01-10T10:00:00.000Z",
          durationMs: null,
          progress: null,
          errorMessage: null,
          warningMessage: null,
          inputImages: [],
          inputAudios: [],
          referenceText: null,
          assets: [
            {
              url: "https://example.com/video.mp4",
              width: null,
              height: null,
              durationSec: null,
            },
          ],
        }}
      />,
    );

    expect(mockUseMonitoringRequestDetail).toHaveBeenCalledWith("video", "vid-1", true);
    expect(screen.getByText("2.5s")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("4s")).toBeInTheDocument();
  });

  it("audio 상세는 오디오 플레이어를 렌더링한다", () => {
    mockUseMonitoringRequestDetail.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    renderWithIntl(
      <MonitoringRequestDetailDialog
        open
        onOpenChange={vi.fn()}
        request={{
          id: "aud-1",
          type: "audio" as never,
          status: "completed",
          model: "qwen-tts",
          createdAt: "2026-01-10T10:00:00.000Z",
          durationMs: 1000,
          apiKeyLabel: "UI",
        }}
        timeZone="UTC"
        detailOverride={{
          id: "aud-1",
          type: "audio" as never,
          status: "completed",
          model: "qwen-tts",
          prompt: "hello audio",
          createdAt: "2026-01-10T10:00:00.000Z",
          updatedAt: "2026-01-10T10:00:01.000Z",
          durationMs: 1000,
          progress: 100,
          errorMessage: null,
          warningMessage: null,
          inputImages: [],
          inputAudios: ["data:audio/wav;base64,UklGRg=="],
          referenceText: "reference words",
          assets: [
            {
              url: "https://example.com/audio.mp3",
              width: null,
              height: null,
              durationSec: 3,
            },
          ],
        }}
      />,
    );

    expect(document.querySelectorAll("audio")).toHaveLength(2);
    expect(screen.getByText("입력 오디오")).toBeTruthy();
    expect(screen.getByText("3s")).toBeTruthy();
    expect(screen.getByText("reference words")).toBeTruthy();
  });

  it("completed 요청의 안내 메시지는 오류가 아니라 경고로 렌더링한다", () => {
    mockUseMonitoringRequestDetail.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    renderWithIntl(
      <MonitoringRequestDetailDialog
        open
        onOpenChange={vi.fn()}
        request={{
          id: "aud-2",
          type: "audio" as never,
          status: "completed",
          model: "qwen-tts",
          createdAt: "2026-01-10T10:00:00.000Z",
          durationMs: 1000,
          apiKeyLabel: "UI",
        }}
        timeZone="UTC"
        detailOverride={{
          id: "aud-2",
          type: "audio" as never,
          status: "completed",
          model: "qwen-tts",
          prompt: "hello audio",
          createdAt: "2026-01-10T10:00:00.000Z",
          updatedAt: "2026-01-10T10:00:01.000Z",
          durationMs: 1000,
          progress: 100,
          errorMessage: null,
          warningMessage:
            "오디오 저장소가 지정되지 않아 외부 저장소 업로드를 건너뛰고 inline 결과를 사용합니다.",
          inputImages: [],
          inputAudios: [],
          referenceText: null,
          assets: [
            {
              url: "https://example.com/audio.mp3",
              width: null,
              height: null,
              durationSec: 3,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("경고")).toBeTruthy();
    expect(screen.queryByText("오류")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "오디오 저장소가 지정되지 않아 외부 저장소 업로드를 건너뛰고 inline 결과를 사용합니다.",
      ),
    ).toBeTruthy();
  });
});
