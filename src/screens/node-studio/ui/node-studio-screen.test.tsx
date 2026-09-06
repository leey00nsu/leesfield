import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerationGraphSnapshotDto } from "@/features/node-studio/model/graph-types";
import enMessages from "@/shared/i18n/messages/en.json";
import { renderWithIntl } from "@/test-utils/intl";

import { NodeStudioScreen } from "./node-studio-screen";
import { rememberSpaceListEntry } from "@/features/node-studio/model/space-navigation";

const mocks = vi.hoisted(() => ({
  useList: vi.fn(),
  useDetail: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  sync: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  update: vi.fn(),
  workspace: vi.fn(),
}));
vi.mock("@/features/node-studio/api/generation-graph-api", () => ({ updateGenerationGraph: mocks.update }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace, back: mocks.back }), useSearchParams: () => new URLSearchParams() }));

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
    onDelete,
    onReloadLatest,
    onSelectGraph,
    onCreateGraph,
    onBack,
    onCreatePreset,
  }: {
    graph: GenerationGraphSnapshotDto;
    onDelete: () => void;
    onReloadLatest: () => void;
    onSelectGraph: (graphId: string) => void;
    onCreateGraph: (title: string) => void;
    onBack: () => void;
    onCreatePreset: (preset: unknown) => Promise<void>;
  }) => {
    mocks.workspace({ onCreatePreset });
    return (
      <div data-testid="workspace">
        <span>{graph.title}</span>
        <button type="button" onClick={onBack}>back to list</button>
        <button type="button" onClick={() => onSelectGraph("graph-b")}>open Graph B</button>
        <button type="button" onClick={() => onCreateGraph("New Workflow")}>new workflow</button>
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
  schemaVersion: 3, groups: [],
  minimumWriterVersion: 3,
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
    window.history.replaceState(null, "");
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

  it("inherits English from the application locale", () => {
    renderWithIntl(<NodeStudioScreen spaceId="graph-a" />, { locale: "en", messages: enMessages });
    expect(screen.getByTestId("node-banana-home")).toHaveAttribute("aria-label", "Space editor");
  });

  it("uses a safe list fallback for a direct editor URL", async () => {
    const user = userEvent.setup();
    renderWithIntl(<NodeStudioScreen spaceId="graph-a" />);
    await user.click(screen.getByRole("button", { name: "back to list" }));
    expect(mocks.replace).toHaveBeenCalledWith("/spaces");
    expect(mocks.back).not.toHaveBeenCalled();
  });
  it("removes the newly created Space when saving a Quickstart preset fails", async () => {
    mocks.update.mockRejectedValueOnce(new Error("save failed"));
    renderWithIntl(<NodeStudioScreen spaceId="graph-a" />);
    const preset = { name: "Failed preset", nodes: [{ id: "p", type: "prompt", position: { x: 0, y: 0 }, data: { prompt: "example" } }], edges: [] };
    await act(async () => { await expect(mocks.workspace.mock.lastCall?.[0].onCreatePreset(preset)).rejects.toThrow("save failed"); });
    expect(mocks.remove).toHaveBeenCalledWith(graphB.id);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("shows a recoverable missing-space error without an endless loading indicator", () => {
    mocks.useDetail.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    renderWithIntl(<NodeStudioScreen spaceId="missing-space" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "스페이스 목록으로" })).toHaveAttribute("href", "/spaces");
  });
  it("does not expose an unguarded recovery link when background queries fail over a cached editor", () => {
    mocks.useList.mockReturnValue({ data: list, isLoading: false, isError: true, refetch: vi.fn() });
    mocks.useDetail.mockReturnValue({ data: graphA, isLoading: false, isError: true, refetch: vi.fn() });
    renderWithIntl(<NodeStudioScreen spaceId="graph-a" />);
    expect(screen.getByTestId("workspace")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "스페이스 목록으로" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("returns to the actual list history entry after list navigation", async () => {
    const user = userEvent.setup();
    rememberSpaceListEntry("graph-a");
    window.history.pushState(null, "");
    renderWithIntl(<NodeStudioScreen spaceId="graph-a" />);
    await user.click(screen.getByRole("button", { name: "back to list" }));
    expect(mocks.back).toHaveBeenCalledOnce();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("기존 creative studio intro 없이 full-bleed Node Banana Home을 구성한다", () => {
    renderWithIntl(<NodeStudioScreen />);

    expect(screen.getByTestId("node-banana-home")).toHaveAttribute(
      "aria-label",
      "스페이스 편집기",
    );
    expect(screen.queryByTestId("generation-studio-intro")).not.toBeInTheDocument();
    expect(screen.queryByTestId("node-studio-graph-controls")).not.toBeInTheDocument();
    expect(screen.queryByText("비주얼 워크플로 편집기")).not.toBeInTheDocument();
  });

  it("명시한 Space를 복원하고 다른 상세 route로 이동한다", async () => {
    const user = userEvent.setup();
    renderWithIntl(<NodeStudioScreen />);

    expect(screen.getByTestId("workspace")).toHaveTextContent("Graph A");
    await user.click(screen.getByRole("button", { name: "open Graph B" }));
    expect(mocks.push).toHaveBeenCalledWith("/spaces/graph-b");
  });

  it("Graph를 생성하고 입력 title을 mutation에 전달한다", async () => {
    const user = userEvent.setup();
    renderWithIntl(<NodeStudioScreen />);

    await user.click(screen.getByRole("button", { name: "new workflow" }));

    expect(mocks.create).toHaveBeenCalledWith("New Workflow");
  });

  it("Graph 생성 실패를 빈 Canvas가 아닌 오류로 표시한다", async () => {
    const user = userEvent.setup();
    mocks.create.mockRejectedValue(new Error("network"));
    renderWithIntl(<NodeStudioScreen />);

    await user.click(screen.getByRole("button", { name: "new workflow" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("스페이스를 만들지 못했습니다.");
  });

  it("Graph가 없어도 자동 생성하지 않는다", async () => {
    mocks.useList.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    mocks.useDetail.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() });

    renderWithIntl(<NodeStudioScreen />);

    expect(await screen.findByText("스페이스를 불러오는 중…")).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });

});
