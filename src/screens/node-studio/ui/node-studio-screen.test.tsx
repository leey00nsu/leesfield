import { useEffect } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GraphAutosaveStatus } from "@/features/node-studio/hook/use-graph-autosave";
import type { GenerationGraphSnapshotDto } from "@/features/node-studio/model/graph-types";
import { renderWithIntl } from "@/test-utils/intl";

import { NodeStudioScreen } from "./node-studio-screen";

const mocks = vi.hoisted(() => ({
  useList: vi.fn(),
  useDetail: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  sync: vi.fn(),
}));

vi.mock("@/features/node-studio/hook/use-generation-graphs", () => ({
  useGenerationGraphList: mocks.useList,
  useGenerationGraph: mocks.useDetail,
  useCreateGenerationGraph: () => ({ mutateAsync: mocks.create, isPending: false }),
  useDeleteGenerationGraph: () => ({ mutateAsync: mocks.remove, isPending: false }),
  useSyncGenerationGraphCache: () => mocks.sync,
}));

vi.mock("@/features/node-studio/ui/node-studio-workspace", () => ({
  NodeStudioWorkspace: ({
    graph,
    onStatusChange,
    onDelete,
    onReloadLatest,
  }: {
    graph: GenerationGraphSnapshotDto;
    onStatusChange: (status: GraphAutosaveStatus) => void;
    onDelete: () => void;
    onReloadLatest: () => void;
  }) => {
    useEffect(() => onStatusChange("saved"), [onStatusChange]);
    return (
      <div data-testid="workspace">
        <span>{graph.title}</span>
        <button type="button" onClick={() => onStatusChange("conflict")}>conflict</button>
        <button type="button" onClick={onDelete}>delete</button>
        <button type="button" onClick={onReloadLatest}>reload</button>
      </div>
    );
  },
}));

const graphA: GenerationGraphSnapshotDto = {
  id: "graph-a",
  title: "Graph A",
  version: 1,
  nodes: [],
  edges: [],
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
};

const graphB = { ...graphA, id: "graph-b", title: "Graph B" };
const list = [graphA, graphB].map((graph) => ({
  id: graph.id,
  title: graph.title,
  version: graph.version,
  createdAt: graph.createdAt,
  updatedAt: graph.updatedAt,
}));

describe("NodeStudioScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useList.mockReturnValue({
      data: list,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useDetail.mockImplementation((graphId: string | null) => ({
      data: graphId === graphB.id ? graphB : graphA,
      isLoading: false,
      isError: false,
      refetch: vi.fn().mockResolvedValue({ data: graphId === graphB.id ? graphB : graphA }),
    }));
    mocks.create.mockResolvedValue(graphB);
    mocks.remove.mockResolvedValue(undefined);
  });

  it("공용 creative studio intro와 Graph control surface를 구성한다", () => {
    renderWithIntl(<NodeStudioScreen />);

    const intro = screen.getByTestId("generation-studio-intro");
    const graphControls = screen.getByTestId("node-studio-graph-controls");

    expect(intro).toContainElement(screen.getByRole("heading", { name: "Node Studio" }));
    expect(intro).toHaveTextContent("비주얼 워크플로 편집기");
    expect(graphControls).toContainElement(screen.getByRole("combobox", { name: "Graph 선택" }));
    expect(graphControls).toContainElement(screen.getByRole("textbox", { name: "새 Graph 이름" }));
  });

  it("목록의 첫 Graph를 복원하고 다른 Graph를 선택한다", async () => {
    const user = userEvent.setup();
    renderWithIntl(<NodeStudioScreen />);

    expect(screen.getByTestId("workspace")).toHaveTextContent("Graph A");
    await user.selectOptions(screen.getByRole("combobox", { name: "Graph 선택" }), graphB.id);
    expect(screen.getByTestId("workspace")).toHaveTextContent("Graph B");
  });

  it("Graph를 생성하고 입력 title을 mutation에 전달한다", async () => {
    const user = userEvent.setup();
    renderWithIntl(<NodeStudioScreen />);

    await user.type(screen.getByRole("textbox", { name: "새 Graph 이름" }), "  새 작업  ");
    await user.click(screen.getByRole("button", { name: "Graph 생성" }));

    expect(mocks.create).toHaveBeenCalledWith("새 작업");
  });

  it("Graph 생성 실패를 빈 Canvas가 아닌 오류로 표시한다", async () => {
    const user = userEvent.setup();
    mocks.create.mockRejectedValue(new Error("network"));
    renderWithIntl(<NodeStudioScreen />);

    await user.type(screen.getByRole("textbox", { name: "새 Graph 이름" }), "새 작업");
    await user.click(screen.getByRole("button", { name: "Graph 생성" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Graph를 만들지 못했습니다");
  });

  it("Graph가 없으면 생성 안내를 표시한다", () => {
    mocks.useList.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    mocks.useDetail.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() });

    renderWithIntl(<NodeStudioScreen />);

    expect(screen.getByRole("heading", { name: "첫 Graph를 만들어 보세요" })).toBeInTheDocument();
  });

  it("충돌 상태의 Graph 전환은 확인 없이 로컬 작업을 버리지 않는다", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithIntl(<NodeStudioScreen />);

    await user.click(screen.getByRole("button", { name: "conflict" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Graph 선택" }), graphB.id);

    expect(confirm).toHaveBeenCalled();
    expect(screen.getByTestId("workspace")).toHaveTextContent("Graph A");
  });
});
