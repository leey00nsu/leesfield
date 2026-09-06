import type {
  GenerationGraphSnapshotDto,
  GenerationGraphSummaryDto,
  UpdateGenerationGraphDto,
} from "../model/graph-types";

type ErrorPayload = { message?: string; errors?: unknown };

export class GenerationGraphApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(code);
    this.name = "GenerationGraphApiError";
  }
}

async function readPayload<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & ErrorPayload;
  if (!response.ok) {
    throw new GenerationGraphApiError(
      response.status,
      payload.message ?? "UNKNOWN_ERROR",
      payload.errors,
    );
  }
  return payload;
}

export async function listGenerationGraphs(signal?: AbortSignal) {
  const response = await fetch("/api/generation-graphs", { cache: "no-store", signal });
  return (await readPayload<{ graphs: GenerationGraphSummaryDto[] }>(response)).graphs;
}

export async function createGenerationGraph(title: string) {
  const response = await fetch("/api/generation-graphs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return (await readPayload<{ graph: GenerationGraphSnapshotDto }>(response)).graph;
}

export async function getGenerationGraph(graphId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/generation-graphs/${encodeURIComponent(graphId)}`, {
    cache: "no-store",
    signal,
  });
  return (await readPayload<{ graph: GenerationGraphSnapshotDto }>(response)).graph;
}

export async function updateGenerationGraph(
  graphId: string,
  snapshot: UpdateGenerationGraphDto,
  signal?: AbortSignal,
) {
  const response = await fetch(`/api/generation-graphs/${encodeURIComponent(graphId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
    signal,
  });
  return (await readPayload<{ graph: GenerationGraphSnapshotDto }>(response)).graph;
}

export async function deleteGenerationGraph(graphId: string) {
  const response = await fetch(`/api/generation-graphs/${encodeURIComponent(graphId)}`, {
    method: "DELETE",
  });
  if (!response.ok) await readPayload(response);
  else await response.text();
}

export async function copyGenerationGraph(graphId: string) {
  const response = await fetch(`/api/generation-graphs/${encodeURIComponent(graphId)}/copy`, { method: "POST" });
  return (await readPayload<{ graph: GenerationGraphSnapshotDto }>(response)).graph;
}
