import type {
  NodeExecutionDto,
  StartNodeExecutionResult,
} from "../model/node-execution-types";
import { createSubmissionIntent } from "@/shared/api/submission-intent";

type ErrorPayload = { message?: string; errors?: unknown };

export class NodeExecutionApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = "NodeExecutionApiError";
  }
}

async function readPayload<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & ErrorPayload;
  if (!response.ok) {
    throw new NodeExecutionApiError(
      response.status,
      payload.message ?? "UNKNOWN_ERROR",
      payload.errors,
    );
  }
  return payload;
}

function executionsUrl(graphId: string, nodeId: string) {
  return `/api/generation-graphs/${encodeURIComponent(graphId)}/nodes/${encodeURIComponent(nodeId)}/executions`;
}

const nodeExecutionIntent = createSubmissionIntent();

export async function listNodeExecutions(graphId: string, nodeId: string, signal?: AbortSignal) {
  const response = await fetch(executionsUrl(graphId, nodeId), { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) });
  return (await readPayload<{ executions: NodeExecutionDto[] }>(response)).executions;
}

export async function startNodeExecution(
  graphId: string,
  nodeId: string,
  expectedGraphVersion: number,
) {
  const body = JSON.stringify({ expectedGraphVersion });
  const key = nodeExecutionIntent.take(
    JSON.stringify({ graphId, nodeId, expectedGraphVersion }),
  );
  try {
    const response = await fetch(executionsUrl(graphId, nodeId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body,
    });
    const execution = (
      await readPayload<{ execution: StartNodeExecutionResult }>(response)
    ).execution;
    nodeExecutionIntent.settle(key);
    return execution;
  } catch (error) {
    nodeExecutionIntent.settle(key, error);
    throw error;
  }
}

export async function cancelNodeExecution(
  graphId: string,
  nodeId: string,
  executionId: string,
) {
  const response = await fetch(
    `${executionsUrl(graphId, nodeId)}/${encodeURIComponent(executionId)}`,
    { method: "DELETE" },
  );
  return (await readPayload<{ execution: NodeExecutionDto }>(response)).execution;
}

export async function updateNodeExecution(
  graphId: string,
  nodeId: string,
  executionId: string,
  update:
    | { status: "processing"; progress: number }
    | { status: "failed"; errorCode: "PROCESSOR_FAILED" | "MEDIA_UPLOAD_FAILED" },
) {
  const response = await fetch(
    `${executionsUrl(graphId, nodeId)}/${encodeURIComponent(executionId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    },
  );
  return (await readPayload<{ execution: NodeExecutionDto }>(response)).execution;
}
