import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQueries } from "@tanstack/react-query";
import { NodeExecutionReadContext } from "../model/node-execution-read-context";
import { nodeExecutionKeys, useNodeExecutions } from "./use-node-executions";
import type { NodeExecutionDto } from "../model/node-execution-types";
const api = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../api/node-execution-api", () => ({ listNodeExecutions: api.list }));
const rows: NodeExecutionDto[] = [{ executionId: "ready", executionKind: "generation", mediaType: "image", graphNodeId: "node", status: "completed", progress: 100, modelKey: "model", outputAssetIds: ["result"], errorCode: null, createdAt: "2026-10-20T00:00:00Z" }];
function Consumer({ graph = "space" }: { graph?: string }) {
  const query = useNodeExecutions(graph, "node");
  return <output>{query.data?.[0]?.executionId ?? "loading"}</output>;
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("node history cannot bypass the workspace fresh-read guard or add another provider request", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const read = vi.fn(async () => rows);
  function Workspace() {
    useQueries({ queries: [{ queryKey: nodeExecutionKeys.list("space", "node"), queryFn: ({ signal }) => read("node", signal) }] });
    return <NodeExecutionReadContext.Provider value={{ graphId: "space", read }}><Consumer /></NodeExecutionReadContext.Provider>;
  }
  render(<QueryClientProvider client={client}><Workspace /></QueryClientProvider>);
  await screen.findByText("ready"); expect(read).toHaveBeenCalledOnce(); expect(api.list).not.toHaveBeenCalled();
  await client.invalidateQueries({ queryKey: nodeExecutionKeys.list("space", "node") });
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2)); expect(api.list).not.toHaveBeenCalled(); client.clear();
});
it("a different graph never uses the previous workspace reader", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }), read = vi.fn(); api.list.mockResolvedValue(rows);
  render(<QueryClientProvider client={client}><NodeExecutionReadContext.Provider value={{ graphId: "old", read }}><Consumer /></NodeExecutionReadContext.Provider></QueryClientProvider>);
  await screen.findByText("ready"); expect(read).not.toHaveBeenCalled(); expect(api.list.mock.calls[0].slice(0, 2)).toEqual(["space", "node"]); client.clear();
});
it("isolated presenter history keeps the ordinary API path without a workspace", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); api.list.mockResolvedValue(rows);
  render(<QueryClientProvider client={client}><Consumer /></QueryClientProvider>);
  await screen.findByText("ready"); expect(api.list).toHaveBeenCalledOnce(); client.clear();
});
