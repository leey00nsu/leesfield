import { act, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MonitoringRequestStatistics as MonitoringDashboardScreen } from "@/screens/monitoring-dashboard/ui/monitoring-request-statistics";
import { createIntlWrapper, renderWithIntl } from "@/test-utils/intl";

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

afterEach(() => vi.unstubAllGlobals());

async function useRealRequests() {
  const actual = await vi.importActual<typeof import("@/features/monitoring-dashboard/hook/use-monitoring-dashboard")>(
    "@/features/monitoring-dashboard/hook/use-monitoring-dashboard",
  );
  mockUseMonitoringRequests.mockImplementation(actual.useMonitoringRequests);
  return actual.useMonitoringRequests;
}

function mockRequestPages() {
  const urls: URL[] = [];
  const pending: Array<() => void> = [];
  vi.stubGlobal("fetch", vi.fn((input: string) => {
    const url = new URL(input, "http://localhost");
    urls.push(url);
    const limit = Number(url.searchParams.get("limit"));
    const offset = Number(url.searchParams.get("offset"));
    const total = url.searchParams.has("type") ? 3 : 123;
    const body = {
      updatedAt: "2026-04-30T06:00:00.000Z", limit, offset,
      total: url.searchParams.get("includeTotal") === "true" ? total : null,
      items: Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => ({
        id: `page-item-${offset + i + 1}`, type: "image", status: "completed",
        model: `page-model-${offset + i + 1}`, createdAt: "2026-04-30T05:58:00.000Z",
        durationMs: 18000, apiKeyLabel: "UI",
      })),
    };
    return new Promise<Response>(resolve => pending.push(() => resolve(Response.json(body))));
  }));
  return {
    urls,
    async complete() {
      await waitFor(() => expect(pending.length).toBeGreaterThan(0));
      // A slow run can enqueue the real hook's polling request before the next
      // page request. Flush all currently waiting responses, not an obsolete poll.
      await act(async () => { for (const respond of pending.splice(0)) respond(); });
    },
  };
}

describe("Monitoring request pagination with the real query", () => {
  it("통계 화면은 요청 목록을 조회하거나 표시하지 않는다", async () => {
    mockUseMonitoringRequests.mockClear();
    renderWithIntl(<MonitoringDashboardScreen/>);
    expect(mockUseMonitoringRequests).not.toHaveBeenCalled();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("최근 작업")).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"다음 페이지"})).not.toBeInTheDocument();
  });

  it("첫 페이지 캐시 없이 이전 페이지를 조회해도 전체 건수를 확보한다", async () => {
    const useRequests = await useRealRequests();
    const pages = mockRequestPages();
    const filters = {
      type: "all" as const, status: "all" as const, model: null, apiKeyId: null, query: null,
      from: new Date("2026-04-23T00:00:00Z"), to: new Date("2026-04-30T23:59:59Z"), tz: "UTC",
    };
    const { result } = renderHook(() => useRequests(filters, { limit: 50, offset: 50 }), {
      wrapper: createIntlWrapper(),
    });
    await pages.complete();
    await waitFor(() => expect(result.current.data?.total).toBe(123));
    expect(result.current.data?.offset).toBe(50);
    expect(result.current.data?.items).toHaveLength(50);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUseMonitoringOverview.mockReturnValue({
    data: {
      activeCount: 12,
      totalCount: 6800,
      failedCount: 8,
      errorRate: 0.0058,
      avgLatencyMs: 320,
      p95LatencyMs: 920,
      usageByType: {
        image: 4080,
        video: 1700,
        audio: 1020,
        other: 0,
      },
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
    data: {
      items: [
        {
          id: "key-1",
          maskedKey: "lf_live_1234",
          status: "active",
        },
      ],
    },
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
  it("통계 카드와 집계 필터를 표시하고 중복 작업 표는 제거한다", async () => {
    const user = userEvent.setup();
    const { container } = renderWithIntl(<MonitoringDashboardScreen />);

    expect(screen.getByText("성공률")).toBeInTheDocument();
    expect(screen.queryByText("활성 작업")).not.toBeInTheDocument();
    expect(screen.getAllByText("요청 수").length).toBeGreaterThan(0);
    expect(screen.queryByText("최근 작업")).not.toBeInTheDocument();
    expect(screen.getByText("트래픽 & 오류")).toBeInTheDocument();
    expect(screen.queryByText("주의")).not.toBeInTheDocument();
    expect(screen.queryByText("기간 내")).not.toBeInTheDocument();
    expect(screen.queryByText("평균")).not.toBeInTheDocument();
    expect(screen.queryByText("성공 비율")).not.toBeInTheDocument();
    expect(screen.queryByText("Top N 지표")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("검색…")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이미지" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "필터" }));
    expect(screen.getByRole("combobox", { name: "유형" })).toBeInTheDocument();
    expect(screen.getByLabelText("시작일")).toBeInTheDocument();
    expect(screen.getByLabelText("종료일")).toBeInTheDocument();
    expect(container.querySelector('input[type="date"]')).toBeNull();
    await user.click(screen.getByLabelText("시작일"));
    expect(document.querySelector("[data-app-calendar]")).toBeTruthy();
    expect(screen.getByLabelText("상태")).toBeInTheDocument();
    expect(screen.getByLabelText("모델")).toBeInTheDocument();
    expect(screen.getByLabelText("API 키")).toBeInTheDocument();
    expect(mockUseMonitoringTop).not.toHaveBeenCalled();
    expect(mockUseMonitoringApiKeys).toHaveBeenCalled();
    expect(mockUseRuntimeModelCatalog).toHaveBeenCalled();
    expect(mockUseMonitoringOverview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "all",
        status: "all",
        model: null,
        apiKeyId: null,
      }),
    );
    expect(screen.queryByText("서비스 상태")).not.toBeInTheDocument();
    expect(screen.queryByText("알림")).not.toBeInTheDocument();
    expect(screen.queryByText("모델 상태")).not.toBeInTheDocument();
    expect(screen.queryByText("스토리지 상태")).not.toBeInTheDocument();
    expect(screen.getByText("선택한 기간 기준 사용량")).toBeInTheDocument();
    expect(screen.getByText("99.42%")).toHaveClass("font-sans");
    expect(screen.getByText("99.42%")).not.toHaveClass("font-serif");
    expect(
      container.querySelectorAll("[data-monitoring-kpi-chart]"),
    ).toHaveLength(2);
    expect(container.querySelector("[data-monitoring-usage-pie]")).toBeTruthy();
    expect(screen.getAllByText("이미지").length).toBeGreaterThan(0);
    expect(screen.getAllByText("비디오").length).toBeGreaterThan(0);
    expect(screen.getAllByText("오디오").length).toBeGreaterThan(0);
    expect(screen.getByText("기타")).toBeInTheDocument();
  });

  it("어시스턴트 유형은 LLM 모델만 제공하고 번역된 이름으로 조회한다", async () => {
    mockUseRuntimeModelCatalog.mockReturnValue({items:[{key:"flux",label:"Flux",type:"image",isActive:true},{key:"assistant-model",label:"Text Model",type:"llm",isActive:true}],isLoading:false,error:null});
    const user=userEvent.setup(); renderWithIntl(<MonitoringDashboardScreen/>);
    await user.click(screen.getByRole("button",{name:"필터"}));
    await user.click(screen.getByRole("combobox",{name:"유형"}));
    await user.click(await screen.findByRole("option",{name:"AI 어시스턴트"}));
    await user.click(screen.getByRole("combobox",{name:"모델"}));
    await user.click(await screen.findByRole("option",{name:"Text Model · AI 어시스턴트"}));
    expect(screen.queryByRole("option",{name:/Flux/})).not.toBeInTheDocument();
    expect(mockUseMonitoringOverview).toHaveBeenLastCalledWith(expect.objectContaining({type:"assistant",model:"assistant-model"}));
  });

  it("필터 변경을 monitoring query에 반영한다", async () => {
    const user = userEvent.setup();
    renderWithIntl(<MonitoringDashboardScreen />);

    await user.click(screen.getByRole("button", { name: "필터" }));
    await user.click(screen.getByRole("combobox", { name: "유형" }));
    await user.click(await screen.findByRole("option", { name: "이미지" }));

    await waitFor(() => {
      expect(mockUseMonitoringOverview).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: "image",
          status: "all",
        }),
      );
    });
    expect(mockUseMonitoringRequests).not.toHaveBeenCalled();
  });

  it("집계 조회 실패를 빈 통계와 구분하고 재시도를 제공한다", async () => {
    const refetch=vi.fn();mockUseMonitoringStats.mockReturnValue({data:null,isLoading:false,isError:true,error:Error("unavailable"),refetch});
    mockUseMonitoringOverview.mockReturnValue({data:null,isLoading:false,isError:false,refetch});
    renderWithIntl(<MonitoringDashboardScreen/>);
    expect(screen.getByRole("alert")).toHaveTextContent("통계를 불러오지 못했습니다");
    await userEvent.setup().click(screen.getByRole("button",{name:"다시 시도"}));
    expect(refetch).toHaveBeenCalledTimes(2);
  });
});
