import type { QueryClient } from "@tanstack/react-query";
import type { NodeExecutionDto } from "./node-execution-types";
import { nodeExecutionKeys } from "../hook/use-node-executions";

export type NodeExecutionOutput = { selectedOutputAssetId?: string | null; outputAssetIds?: string[]; outputGrid?: { rows: number; cols: number } };
export type NodeExecutionReceipt = { executionId: string; completion: Promise<void> };
export type NodeExecutionSubmission = void | NodeExecutionOutput | NodeExecutionReceipt;

/** Subscribe to the workspace query, without a second poller or job deadline. */
export function observeServerExecution(client: QueryClient, graphId: string, nodeId: string, executionId: string, signal: AbortSignal) {
  return new Promise<NodeExecutionDto>((resolve, reject) => {
    const cleanup = () => { unsubscribe(); signal.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(new DOMException("Execution observation stopped", "AbortError")); };
    const check = () => {
      const executions = client.getQueryData<NodeExecutionDto[]>(nodeExecutionKeys.list(graphId, nodeId));
      const execution = executions?.find(item => item.executionId === executionId);
      if (!execution || ["pending", "processing", "uploading"].includes(execution.status)) return;
      cleanup();
      if (execution.status === "completed") resolve(execution);
      else reject(new Error(execution.errorCode ?? `NODE_EXECUTION_${execution.status.toUpperCase()}`));
    };
    const unsubscribe = client.getQueryCache().subscribe(check);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort(); else check();
  });
}

type SelectionRead = { revision: number; sequence: number };
type ObservedExecution = { id: string; revision: number; preserved?: string };

/** Selection intent belongs to a workspace session and an observed execution.
 * Cached query data never calls observe: only a successful, non-aborted read does.
 */
export class ExecutionSelectionTracker {
  private revisions = new Map<string, number>();
  private sequences = new Map<string, number>();
  private readBaselines = new Map<string, number>();
  private executions = new Map<string, ObservedExecution>();
  private submissions = new Map<string, number>();

  changed(nodeId: string) {
    this.revisions.set(nodeId, (this.revisions.get(nodeId) ?? 0) + 1);
  }

  beginRead(nodeId: string): SelectionRead {
    const sequence = (this.sequences.get(nodeId) ?? 0) + 1;
    this.sequences.set(nodeId, sequence);
    const revision = this.readBaselines.get(nodeId) ?? this.revisions.get(nodeId) ?? 0;
    this.readBaselines.set(nodeId, revision);
    return { sequence, revision };
  }

  beginSubmission(nodeId: string) {
    this.submissions.set(nodeId, this.revisions.get(nodeId) ?? 0);
  }

  submitted(nodeId: string, executionId: string) {
    this.executions.set(nodeId, { id: executionId,
      revision: this.submissions.get(nodeId) ?? this.revisions.get(nodeId) ?? 0 });
    this.submissions.delete(nodeId);
  }

  endSubmission(nodeId: string) { this.submissions.delete(nodeId); }

  observe(nodeId: string, executions: readonly NodeExecutionDto[], read: SelectionRead, current: string | null):
    { selection?: string | null; preserve?: true } {
    if (read.sequence !== this.sequences.get(nodeId)) return {};
    this.readBaselines.delete(nodeId);
    const latest = executions[0];
    if (!latest) return {};
    let observed = this.executions.get(nodeId);
    if (observed?.id !== latest.executionId) {
      // Until POST acknowledges the execution ID, a response may still be
      // older history. A pending submission must never weaken its read guard.
      observed = { id: latest.executionId, revision: Math.min(read.revision, this.submissions.get(nodeId) ?? read.revision) };
      this.executions.set(nodeId, observed);
    }
    if (latest.status !== "completed" || latest.selectedOutputAssetId === undefined) return {};
    const revision = this.revisions.get(nodeId) ?? 0;
    if (revision !== observed.revision) {
      // Preserve explicit choice (including A→B→A), even across subsequent
      // reads of the same execution; do not repeatedly enqueue identical saves.
      const signature = JSON.stringify([revision, latest.selectedOutputAssetId]);
      if (current !== latest.selectedOutputAssetId && observed.preserved !== signature) {
        observed.preserved = signature;
        return { preserve: true };
      }
      return {};
    }
    return { selection: latest.selectedOutputAssetId };
  }
}
