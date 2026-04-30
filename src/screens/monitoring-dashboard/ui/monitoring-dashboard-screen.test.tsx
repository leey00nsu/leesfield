import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MonitoringDashboardScreen } from "@/screens/monitoring-dashboard/ui/monitoring-dashboard-screen";
import { renderWithIntl } from "@/test-utils/intl";

const mockUseMonitoringOverview = vi.hoisted(() => vi.fn());
const mockUseMonitoringStats = vi.hoisted(() => vi.fn());
const mockUseMonitoringRequests = vi.hoisted(() => vi.fn());
const mockUseMonitoringTop = vi.hoisted(() => vi.fn());
const mockUseMonitoringApiKeys = vi.hoisted(() => vi.fn());
const mockUseMonitoringRequestDetail = vi.hoisted(() => vi.fn());
const mockUseRuntimeModelCatalog = vi.hoisted(() => vi.fn());

vi.mock("@/features/monitoring-dashboard/hook/use-monitoring-dashboard", () => ({
  useMonitoringOverview: mockUseMonitoringOverview,
  useMonitoringStats: mockUseMonitoringStats,
  useMonitoringRequests: mockUseMonitoringRequests,
  useMonitoringTop: mockUseMonitoringTop,
  useMonitoringApiKeys: mockUseMonitoringApiKeys,
  useMonitoringRequestDetail: mockUseMonitoringRequestDetail,
}));

vi.mock("@/shared/lib/hooks/use-runtime-model-catalog", () => ({
  useRuntimeModelCatalog: mockUseRuntimeModelCatalog,
}));

beforeAll(() => {
  const elementProto = HTMLElement.prototype as HTMLElement & {
    hasPointerCapture?: (pointerId: number) => boolean;
    setPointerCapture?: (pointerId: number) => void;
    releasePointerCapture?: (pointerId: number) => void;
  };
  const nodeProto = Element.prototype as Element & {
    scrollIntoView?: (arg?: boolean | ScrollIntoViewOptions) => void;
  };

  elementProto.hasPointerCapture ??= () => false;
  elementProto.setPointerCapture ??= () => {};
  elementProto.releasePointerCapture ??= () => {};
  nodeProto.scrollIntoView ??= () => {};
});

beforeEach(() => {
  mockUseMonitoringOverview.mockReturnValue({
    data: {
      activeCount: 12,
      totalCount: 6800,
      failedCount: 8,
      errorRate: 0.0058,
      avgLatencyMs: 320,
      p95LatencyMs: 920,
    },
    isLoading: false,
    error: null,
  });
  mockUseMonitoringStats.mockReturnValue({
    data: {
      items: [
        {
          day: "2026-04-28",
          total: 120,
          failed: 1,
          errorRate: 0.004,
          avgLatencyMs: 280,
          p95LatencyMs: 820,
        },
        {
          day: "2026-04-29",
          total: 180,
          failed: 2,
          errorRate: 0.006,
          avgLatencyMs: 320,
          p95LatencyMs: 920,
        },
      ],
    },
    isLoading: false,
    error: null,
  });
  mockUseMonitoringRequests.mockReturnValue({
    data: {
      updatedAt: "2026-04-30T06:00:00.000Z",
      total: 1,
      limit: 50,
      offset: 0,
      items: [
        {
          id: "req-1",
          type: "image",
          status: "completed",
          model: "Flux Pro 1.1",
          createdAt: "2026-04-30T05:58:00.000Z",
          durationMs: 18_000,
          apiKeyLabel: "UI request",
        },
      ],
    },
    isLoading: false,
    error: null,
  });
  mockUseMonitoringTop.mockReturnValue({
    data: {
      metric: "requests",
      limit: 5,
      models: [
        {
          key: "flux",
          label: "Flux Pro 1.1",
          total: 120,
          failed: 1,
          errorRate: 0.004,
          avgLatencyMs: 320,
          p95LatencyMs: 920,
        },
      ],
      apiKeys: [],
    },
    isLoading: false,
    error: null,
  });
  mockUseMonitoringApiKeys.mockReturnValue({
    data: { items: [] },
    isLoading: false,
    error: null,
  });
  mockUseRuntimeModelCatalog.mockReturnValue({
    items: [
      {
        key: "flux",
        label: "Flux Pro 1.1",
        type: "image",
        vendor: "flux",
        provider: "internal",
        parameters: {},
        meta: {},
        isActive: true,
        isDefault: true,
      },
    ],
    isLoading: false,
    error: null,
  });
  mockUseMonitoringRequestDetail.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
  });
});

describe("MonitoringDashboardScreen", () => {
  it("운영 대시보드 카드와 최근 작업 영역을 표시한다", () => {
    renderWithIntl(<MonitoringDashboardScreen />);

    expect(screen.getByText("성공률")).toBeInTheDocument();
    expect(screen.getByText("활성 작업")).toBeInTheDocument();
    expect(screen.getByText("API 사용량")).toBeInTheDocument();
    expect(screen.getByText("최근 작업")).toBeInTheDocument();
    expect(screen.getByText("서비스 상태")).toBeInTheDocument();
    expect(screen.getByText("알림")).toBeInTheDocument();
    expect(screen.getByText("모델 상태")).toBeInTheDocument();
    expect(screen.getByText("큐 활동")).toBeInTheDocument();
  });

  it("최근 작업을 클릭하면 요청 상세를 연다", async () => {
    const user = userEvent.setup();
    mockUseMonitoringRequestDetail.mockImplementation(
      (_type: "image" | "video" | null, requestId: string | null) => ({
        data: requestId
          ? {
              id: "req-1",
              type: "image",
              status: "completed",
              model: "Flux Pro 1.1",
              prompt: "A cinematic product shot",
              createdAt: "2026-04-30T05:58:00.000Z",
              updatedAt: "2026-04-30T05:58:18.000Z",
              durationMs: 18_000,
              progress: 100,
              errorMessage: null,
              warningMessage: null,
              inputImages: [],
              inputAudios: [],
              referenceText: null,
              assets: [],
            }
          : null,
        isLoading: false,
        error: null,
      }),
    );

    renderWithIntl(<MonitoringDashboardScreen />);

    await user.click(within(screen.getByRole("table")).getByText("Flux Pro 1.1"));

    await waitFor(() => {
      expect(screen.getByText("요청 상세")).toBeInTheDocument();
    });
  });
});
