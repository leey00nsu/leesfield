import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test-utils/intl";

import { NodeExecutionApiError } from "../../api/node-execution-api";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  selectAsset: vi.fn(),
  mutate: vi.fn(),
  cancel: vi.fn(),
  getAsset: vi.fn(),
  query: {
    data: [] as Array<Record<string, unknown>>,
    isError: false,
  },
  mutation: { isPending: false, mutateAsync: vi.fn() },
  cancelMutation: { isPending: false, isError: false, mutate: vi.fn() },
}));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span role="img" aria-label={alt} data-src={src} />
  ),
}));
vi.mock("@/features/media-assets/api/media-asset-api", () => ({
  getMediaAsset: (...args: unknown[]) => mocks.getAsset(...args),
}));
vi.mock("../../model/node-authoring-context", () => ({
  useNodeAuthoring: () => ({
    graphId: "graph-1",
    prepareImageNodeExecution: mocks.prepare,
    selectNodeOutputAsset: mocks.selectAsset,
    writable: true,
  }),
}));
vi.mock("../../hook/use-node-executions", () => ({
  useNodeExecutions: () => mocks.query,
  useStartNodeExecution: () => mocks.mutation,
  useCancelNodeExecution: () => mocks.cancelMutation,
}));

import { GenerationNodeExecution } from "./generation-node-execution";

const config = {
  prompt: "a quiet lake",
  modelKey: "model-a",
  parameters: {},
};

function record(
  status: "pending" | "processing" | "completed" | "failed",
  outputAssetIds: string[] = [],
) {
  return {
    executionId: `request-${status}`,
    executionKind: "generation",
    mediaType: "image",
    graphNodeId: "node-1",
    status,
    progress: status === "processing" ? 45 : status === "completed" ? 100 : 0,
    errorCode: status === "failed" ? "GENERATION_FAILED" : null,
    createdAt: "2026-08-24T00:00:00.000Z",
    modelKey: "model-a",
    outputAssetIds,
  };
}

function asset(id: string) {
  return {
    id,
    version: 1,
    type: "image",
    status: "completed",
    origin: "generation",
    mimeType: "image/png",
    bytes: "1024",
    width: 1024,
    height: 1024,
    durationMs: null,
    sourceOperationId: null,
    url: `https://example.com/${id}.png`,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
  };
}

describe("GenerationNodeExecution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.data = [];
    mocks.query.isError = false;
    mocks.mutation.isPending = false;
    mocks.mutation.mutateAsync = mocks.mutate;
    mocks.cancelMutation.isPending = false;
    mocks.cancelMutation.isError = false;
    mocks.cancelMutation.mutate = mocks.cancel;
    mocks.prepare.mockResolvedValue(4);
    mocks.mutate.mockResolvedValue({ executionId: "request-1" });
    mocks.getAsset.mockImplementation((id: string) => Promise.resolve(asset(id)));
  });

  it("uses the common v2 execution route after saving the Graph", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <GenerationNodeExecution nodeId="node-1" mediaType="image" prompt={config.prompt} modelKey={config.modelKey} selectedOutputAssetId={null} expanded />,
    );

    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.mutate).toHaveBeenCalledWith({
      graphId: "graph-1",
      nodeId: "node-1",
      expectedGraphVersion: 4,
    });
  });

  it("hides idle filler copy and explains exactly why Run is blocked", () => {
    renderWithIntl(
      <GenerationNodeExecution
        nodeId="node-1"
        mediaType="image"
        prompt={config.prompt}
        modelKey={config.modelKey}
        selectedOutputAssetId={null}
        expanded
        runReadiness={{ ready: false, reasons: ["PARAMETERS_INVALID"] }}
      />,
    );

    expect(screen.queryByText("실행 대기")).not.toBeInTheDocument();
    expect(screen.getByText("모델 설정값을 확인해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
  });

  it("shows progress and cancels by the common execution id", async () => {
    const user = userEvent.setup();
    mocks.query.data = [record("processing")];
    renderWithIntl(
      <GenerationNodeExecution nodeId="node-1" mediaType="image" prompt={config.prompt} modelKey={config.modelKey} selectedOutputAssetId={null} expanded />,
    );

    expect(screen.getByText(/생성 중/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "45");
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(mocks.cancel).toHaveBeenCalledWith({
      graphId: "graph-1",
      nodeId: "node-1",
      executionId: "request-processing",
    });
  });

  it("resolves durable output assets and persists only the selected asset id", async () => {
    const user = userEvent.setup();
    mocks.query.data = [record("completed", ["asset-new", "asset-old"])];
    renderWithIntl(
      <GenerationNodeExecution
        nodeId="node-1"
        mediaType="image"
        prompt={config.prompt}
        modelKey={config.modelKey}
        selectedOutputAssetId="asset-old"
        expanded
      />,
    );

    expect(await screen.findByRole("img", { name: "최신 생성 결과" })).toHaveAttribute(
      "data-src",
      "https://example.com/asset-old.png",
    );
    await user.click(screen.getByRole("button", { name: "결과 1 선택" }));
    expect(mocks.selectAsset).toHaveBeenCalledWith("node-1", "asset-new");
  });

  it("renders the first durable output without emitting a render-time Graph mutation", async () => {
    mocks.query.data = [record("completed", ["asset-1"])];
    renderWithIntl(
      <GenerationNodeExecution nodeId="node-1" mediaType="image" prompt={config.prompt} modelKey={config.modelKey} selectedOutputAssetId={null} expanded />,
    );

    await screen.findByRole("img", { name: "최신 생성 결과" });
    expect(mocks.selectAsset).not.toHaveBeenCalled();
  });

  it.each([
    ["NODE_INPUT_SELECTION_REQUIRED", {}, "연결된 source 노드에서 사용할 결과를 선택한 뒤 다시 실행하세요."],
    ["NODE_INPUT_INVALID", {}, "선택된 source 결과를 사용할 수 없습니다. source 노드를 다시 실행하거나 다른 결과를 선택하세요."],
    ["NODE_INPUT_UNSUPPORTED", { limit: 0, count: 1 }, "선택한 모델은 이미지 입력을 지원하지 않습니다. 입력 연결을 해제하거나 다른 모델을 선택하세요."],
    ["NODE_INPUT_LIMIT_EXCEEDED", { limit: 2, count: 3 }, "선택한 모델은 이미지 입력을 최대 2개까지 지원합니다. 일부 연결을 해제하세요."],
    ["GRAPH_VERSION_CONFLICT", undefined, "서버에 최신 Graph가 있습니다. 다시 불러온 뒤 실행하세요."],
  ])("maps %s to a recoverable action", async (code, details, message) => {
    const user = userEvent.setup();
    mocks.mutate.mockRejectedValueOnce(new NodeExecutionApiError(400, code, details));
    renderWithIntl(
      <GenerationNodeExecution nodeId="node-1" mediaType="image" prompt={config.prompt} modelKey={config.modelKey} selectedOutputAssetId={null} expanded />,
    );

    await user.click(screen.getByRole("button", { name: "Run" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeEnabled();
  });
});
