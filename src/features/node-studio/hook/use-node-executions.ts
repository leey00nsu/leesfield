"use client";

import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  cancelNodeExecution,
  listNodeExecutions,
  NodeExecutionApiError,
  startNodeExecution,
  updateNodeExecution,
} from "../api/node-execution-api";
import type { NodeExecutionDto } from "../model/node-execution-types";
import {
  useGenerationEventChannelState,
  type GenerationEventChannelState,
} from "../model/generation-event-channel-context";

const FALLBACK_POLL_INTERVAL_MS = 2_000;
const CONNECTED_SAFETY_POLL_INTERVAL_MS = 15_000;

export const nodeExecutionKeys = {
  graph: (graphId: string) => ["node-executions", graphId] as const,
  list: (graphId: string, nodeId: string) =>
    [...nodeExecutionKeys.graph(graphId), nodeId] as const,
};

export function hasActiveNodeExecution(executions: readonly NodeExecutionDto[] | undefined) {
  return executions?.some((execution) =>
    execution.status === "pending" ||
    execution.status === "processing" ||
    execution.status === "uploading",
  ) ?? false;
}

export function nodeExecutionRefetchInterval(
  executions: readonly NodeExecutionDto[] | undefined,
  eventChannelState: GenerationEventChannelState,
) {
  if (executions && !hasActiveNodeExecution(executions)) return false;
  return eventChannelState === "connected"
    ? CONNECTED_SAFETY_POLL_INTERVAL_MS
    : FALLBACK_POLL_INTERVAL_MS;
}

export function useNodeExecutions(graphId: string, nodeId: string, enabled = true, activePollMs?: number) {
  const eventChannelState = useGenerationEventChannelState();
  return useQuery({
    queryKey: nodeExecutionKeys.list(graphId, nodeId),
    queryFn: ({ signal }) => listNodeExecutions(graphId, nodeId, signal),
    enabled,
    refetchInterval: (query) =>
      activePollMs && hasActiveNodeExecution(query.state.data) ? activePollMs
        : nodeExecutionRefetchInterval(query.state.data, eventChannelState),
  });
}

export function useStartNodeExecution() {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  return useMutation({
    mutationFn: async ({ graphId, nodeId, expectedGraphVersion, repeat }: {
      graphId: string;
      nodeId: string;
      expectedGraphVersion: number;
      repeat?: { repeatOfExecutionId: string; repeatIndex: number };
    }) => {
      if (inFlight.current) throw new NodeExecutionApiError(409, "NODE_GENERATION_ACTIVE");
      inFlight.current = true;
      try {
        return await startNodeExecution(graphId, nodeId, expectedGraphVersion, repeat);
      } finally {
        inFlight.current = false;
      }
    },
    onSuccess: async (result, variables) => {
      const key = nodeExecutionKeys.list(variables.graphId, variables.nodeId);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<NodeExecutionDto[]>(key, (previous = []) => [{
        ...result, modelKey: null, errorCode: null, outputAssetIds: [], createdAt: new Date().toISOString(),
      }, ...previous.filter(item => item.executionId !== result.executionId)]);
      void queryClient.invalidateQueries({
        queryKey: nodeExecutionKeys.list(variables.graphId, variables.nodeId),
      });
    },
  });
}

export function useCancelNodeExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ graphId, nodeId, executionId }: {
      graphId: string;
      nodeId: string;
      executionId: string;
    }) => cancelNodeExecution(graphId, nodeId, executionId),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: nodeExecutionKeys.list(variables.graphId, variables.nodeId) });
    },
  });
}

export function useSelectAssistantItem() {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  return useMutation({
    mutationFn: async ({ graphId, nodeId, executionId, itemId, expectedSelectionVersion }: {
      graphId: string; nodeId: string; executionId: string; itemId: string; expectedSelectionVersion: number;
    }) => {
      if (inFlight.current) throw new NodeExecutionApiError(409, "ASSISTANT_SELECTION_CONFLICT");
      inFlight.current = true;
      try { return await updateNodeExecution(graphId, nodeId, executionId, { action: "select-item", itemId, expectedSelectionVersion }); }
      finally { inFlight.current = false; }
    },
    onSuccess: async (result, variables) => {
      const key = nodeExecutionKeys.list(variables.graphId, variables.nodeId);
      // Cancel history reads begun before selection. Their older version must
      // not replace a server-confirmed choice in either canvas consumer.
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<NodeExecutionDto[]>(key, previous => previous?.map(row => row.executionId === result.executionId
        && (row.selectionVersion ?? 0) <= (result.selectionVersion ?? 0) ? result : row));
    },
    onSettled: (_result, _error, variables) => {
      void queryClient.invalidateQueries({ queryKey: nodeExecutionKeys.list(variables.graphId, variables.nodeId) });
    },
  });
}
