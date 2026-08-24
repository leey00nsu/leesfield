import type {
  ExecuteNodeGenerationResult,
  NodeGenerationDto,
} from "../model/node-generation-types";

type ErrorPayload = { message?: string; errors?: unknown };

export class NodeGenerationApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(code);
    this.name = "NodeGenerationApiError";
  }
}

async function readPayload<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & ErrorPayload;
  if (!response.ok) {
    throw new NodeGenerationApiError(
      response.status,
      payload.message ?? "UNKNOWN_ERROR",
      payload.errors,
    );
  }
  return payload;
}

function nodeGenerationUrl(graphId: string, nodeId: string) {
  return `/api/generation-graphs/${encodeURIComponent(graphId)}/nodes/${encodeURIComponent(nodeId)}/generations`;
}

export async function listNodeGenerations(
  graphId: string,
  nodeId: string,
  signal?: AbortSignal,
) {
  const response = await fetch(nodeGenerationUrl(graphId, nodeId), {
    cache: "no-store",
    signal,
  });
  return (await readPayload<{ generations: NodeGenerationDto[] }>(response))
    .generations;
}

export async function executeNodeGeneration(
  graphId: string,
  nodeId: string,
  expectedGraphVersion: number,
) {
  const response = await fetch(nodeGenerationUrl(graphId, nodeId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedGraphVersion }),
  });
  return (await readPayload<{ generation: ExecuteNodeGenerationResult }>(response))
    .generation;
}
