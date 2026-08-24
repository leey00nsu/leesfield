import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerationGraphSnapshotDto } from "@/features/node-studio/model/graph-types";
import { renderWithIntl } from "@/test-utils/intl";

import { NodeStudioWorkspace } from "./node-studio-workspace";

const mocks = vi.hoisted(() => ({
  useAutosave: vi.fn(),
  update: vi.fn(),
  retry: vi.fn(),
  saveNow: vi.fn(),
  nodeStudio: vi.fn(),
}));

vi.mock("../hook/use-graph-autosave", () => ({
  useGraphAutosave: mocks.useAutosave,
}));

vi.mock("@/shared/lib/hooks/use-runtime-model-catalog", () => ({
  useRuntimeModelCatalog: () => ({
    imageModels: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("./node-studio", () => ({
  NodeStudio: (props: unknown) => {
    mocks.nodeStudio(props);
    return <div>canvas</div>;
  },
}));

const graph: GenerationGraphSnapshotDto = {
  id: "graph-a",
  title: "Graph A",
  version: 3,
  nodes: [],
  edges: [],
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
};

describe("NodeStudioWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAutosave.mockReturnValue({
      status: "saved",
      version: 3,
      update: mocks.update,
      retry: mocks.retry,
      saveNow: mocks.saveNow,
    });
    mocks.saveNow.mockResolvedValue({ status: "saved", version: 3 });
  });

  it("Graph 이름 변경을 autosave draft에 반영한다", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <NodeStudioWorkspace
        graph={graph}
        onSaved={vi.fn()}
        onDelete={vi.fn()}
        onReloadLatest={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    const title = screen.getByRole("textbox", { name: "Graph 이름" });
    await user.clear(title);
    await user.type(title, "Renamed");

    expect(mocks.update).toHaveBeenLastCalledWith({ title: "Renamed", nodes: [], edges: [] });
  });

  it("Node 실행 전에 autosave 완료 version을 제공한다", async () => {
    renderWithIntl(
      <NodeStudioWorkspace
        graph={graph}
        onSaved={vi.fn()}
        onDelete={vi.fn()}
        onReloadLatest={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    const props = mocks.nodeStudio.mock.lastCall?.[0] as {
      prepareImageNodeExecution: () => Promise<number>;
    };
    await expect(props.prepareImageNodeExecution()).resolves.toBe(3);
    expect(mocks.saveNow).toHaveBeenCalledOnce();
  });

  it("충돌 안내를 유지하고 확인 후 최신 snapshot을 다시 불러온다", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    mocks.useAutosave.mockReturnValue({
      status: "conflict",
      version: 3,
      update: mocks.update,
      retry: mocks.retry,
      saveNow: mocks.saveNow,
    });
    renderWithIntl(
      <NodeStudioWorkspace
        graph={graph}
        onSaved={vi.fn()}
        onDelete={vi.fn()}
        onReloadLatest={reload}
        onStatusChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("서버에 더 최신 버전이 있습니다");
    await user.click(screen.getByRole("button", { name: "최신 버전 불러오기" }));
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "최신 버전 불러오기" }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("삭제 확인 전에는 Graph를 삭제하지 않는다", async () => {
    const user = userEvent.setup();
    const remove = vi.fn();
    renderWithIntl(
      <NodeStudioWorkspace
        graph={graph}
        onSaved={vi.fn()}
        onDelete={remove}
        onReloadLatest={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Graph 삭제" }));
    expect(remove).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Graph 삭제" }),
    );
    expect(remove).toHaveBeenCalledOnce();
  });
});
