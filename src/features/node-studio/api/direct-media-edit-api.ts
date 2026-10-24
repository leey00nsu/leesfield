import { GenerationGraphApiError } from "./generation-graph-api";
import type { DirectEditDto, DirectEditRequest } from "@/shared/media-assets/direct-media-edit";
const base = (graphId: string, nodeId: string) => `/api/generation-graphs/${encodeURIComponent(graphId)}/nodes/${encodeURIComponent(nodeId)}/media-edits`;
async function request(url: string, init?: RequestInit): Promise<DirectEditDto> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new GenerationGraphApiError(response.status, payload.message ?? "EDIT_REQUEST_FAILED");
  return payload.operation;
}
export const directMediaEditApi = {
  start: (graph: string, node: string, input: DirectEditRequest) => request(base(graph, node), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(90_000),
  }),
  get: (graph: string, node: string, id: string, signal?: AbortSignal) => request(base(graph, node) + "/" + encodeURIComponent(id), { signal }),
  cancel: (graph: string, node: string, id: string) => request(base(graph, node) + "/" + encodeURIComponent(id), { method: "DELETE", signal: AbortSignal.timeout(10_000) }),
};
