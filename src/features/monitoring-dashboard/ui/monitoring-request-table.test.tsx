import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type {
  MonitoringRequestDetail,
  MonitoringRequestItem,
} from "@/features/monitoring-dashboard/model/types";
import { MonitoringRequestTable } from "@/features/monitoring-dashboard/ui/monitoring-request-table";
import { renderWithIntl } from "@/test-utils/intl";

const mockUseMonitoringRequestDetail = vi.hoisted(() => vi.fn());

vi.mock("@/features/monitoring-dashboard/hook/use-monitoring-dashboard", () => ({
  useMonitoringRequestDetail: mockUseMonitoringRequestDetail,
}));

function createItems(count: number): MonitoringRequestItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `req-${index + 1}`,
    type: index % 2 === 0 ? "image" : "video",
    status: index % 3 === 0 ? "completed" : "processing",
    model: `model-${index + 1}`,
    createdAt: `2026-01-10T10:${String(index).padStart(2, "0")}:00.000Z`,
    durationMs: index % 3 === 0 ? 1_000 : null,
    apiKeyLabel: `key-${index + 1}`,
  }));
}

afterEach(() => {
  vi.clearAllMocks();
});

beforeAll(() => {
  const elementProto = HTMLElement.prototype as HTMLElement & {
    hasPointerCapture?: (pointerId: number) => boolean;
    setPointerCapture?: (pointerId: number) => void;
    releasePointerCapture?: (pointerId: number) => void;
  };
  const nodeProto = Element.prototype as Element & {
    scrollIntoView?: (arg?: boolean | ScrollIntoViewOptions) => void;
  };

  if (!elementProto.hasPointerCapture) {
    elementProto.hasPointerCapture = () => false;
  }
  if (!elementProto.setPointerCapture) {
    elementProto.setPointerCapture = () => {};
  }
  if (!elementProto.releasePointerCapture) {
    elementProto.releasePointerCapture = () => {};
  }
  if (!nodeProto.scrollIntoView) {
    nodeProto.scrollIntoView = () => {};
  }
});

describe("MonitoringRequestTable", () => {
  it("범위/전체 건수와 페이지 정보를 표시한다", () => {
    const items = createItems(50);
    mockUseMonitoringRequestDetail.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    renderWithIntl(
      <MonitoringRequestTable
        items={items}
        total={2431}
        limit={50}
        offset={50}
        onLimitChange={vi.fn()}
        onOffsetChange={vi.fn()}
        isLoading={false}
        error={null}
        updatedAt="2026-01-10T10:00:00.000Z"
        timeZone="UTC"
      />,
    );

    expect(screen.getByText("51-100 / 2,431")).toBeInTheDocument();
    expect(screen.getByText("2/49")).toBeInTheDocument();
  });

  it("페이지 이동/행 수 변경 이벤트를 전달한다", async () => {
    const user = userEvent.setup();
    const items = createItems(50);
    const onOffsetChange = vi.fn();
    const onLimitChange = vi.fn();
    mockUseMonitoringRequestDetail.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    renderWithIntl(
      <MonitoringRequestTable
        items={items}
        total={2431}
        limit={50}
        offset={50}
        onLimitChange={onLimitChange}
        onOffsetChange={onOffsetChange}
        isLoading={false}
        error={null}
        updatedAt="2026-01-10T10:00:00.000Z"
        timeZone="UTC"
      />,
    );

    await user.click(screen.getByRole("button", { name: "이전 페이지" }));
    await user.click(screen.getByRole("button", { name: "다음 페이지" }));
    expect(onOffsetChange).toHaveBeenCalledWith(0);
    expect(onOffsetChange).toHaveBeenCalledWith(100);

    await user.click(screen.getByRole("combobox"));
    await user.keyboard("{End}{Enter}");

    await waitFor(() => {
      expect(onLimitChange).toHaveBeenCalledWith(100);
    });
  }, 10_000);

  it("행 선택 시 상세 모달을 연다", async () => {
    const user = userEvent.setup();
    const detail: MonitoringRequestDetail = {
      id: "req-1",
      type: "image",
      status: "completed",
      model: "flux",
      prompt: "test prompt",
      createdAt: "2026-01-10T10:00:00.000Z",
      updatedAt: "2026-01-10T10:00:01.000Z",
      durationMs: 1_000,
      progress: 100,
      errorMessage: null,
      warningMessage: null,
      inputImages: [],
      inputAudios: [],
      referenceText: null,
      assets: [],
    };
    mockUseMonitoringRequestDetail.mockImplementation(
      (_type: "image" | "video" | null, requestId: string | null) => ({
        data: requestId ? detail : null,
        isLoading: false,
        error: null,
      }),
    );

    renderWithIntl(
      <MonitoringRequestTable
        items={createItems(1)}
        total={1}
        limit={20}
        offset={0}
        onLimitChange={vi.fn()}
        onOffsetChange={vi.fn()}
        isLoading={false}
        error={null}
        updatedAt="2026-01-10T10:00:00.000Z"
        timeZone="UTC"
      />,
    );

    await user.click(screen.getByText("model-1"));

    await waitFor(() => {
      expect(screen.getByText("요청 상세")).toBeInTheDocument();
    });
  });
});
