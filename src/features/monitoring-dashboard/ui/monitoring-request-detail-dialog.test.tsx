import "@testing-library/jest-dom/vitest";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MonitoringRequestDetailDialog } from "@/features/monitoring-dashboard/ui/monitoring-request-detail-dialog";
import { renderWithIntl } from "@/test-utils/intl";

vi.mock("@/features/monitoring-dashboard/hook/use-monitoring-dashboard", () => ({
  useMonitoringRequestDetail: () => ({
    data: null,
    isLoading: false,
    error: null,
  }),
}));

describe("MonitoringRequestDetailDialog", () => {
  it("audio 상세는 오디오 플레이어를 렌더링한다", () => {
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
