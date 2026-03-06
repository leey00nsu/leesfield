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
          inputImages: [],
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

    expect(document.querySelector("audio")).not.toBeNull();
    expect(screen.getByText("3s")).toBeTruthy();
  });
});
