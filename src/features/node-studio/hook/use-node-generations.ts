"use client";

import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  executeNodeGeneration,
  listNodeGenerations,
  NodeGenerationApiError,
} from "../api/node-generation-api";
import type { NodeGenerationDto } from "../model/node-generation-types";
import {
  useGenerationEventChannelState,
  type GenerationEventChannelState,
} from "../model/generation-event-channel-context";

const FALLBACK_POLL_INTERVAL_MS = 2_000;
const CONNECTED_SAFETY_POLL_INTERVAL_MS = 15_000;

export const nodeGenerationKeys = {
  graph: (graphId: string) => ["node-generations", graphId] as const,
  list: (graphId: string, nodeId: string) =>
    [...nodeGenerationKeys.graph(graphId), nodeId] as const,
};

export function shouldPollNodeGenerations(
  generations: readonly NodeGenerationDto[] | undefined,
) {
  const status = generations?.[0]?.status;
  return status === "pending" || status === "processing";
}

export function nodeGenerationRefetchInterval(
  generations: readonly NodeGenerationDto[] | undefined,
  eventChannelState: GenerationEventChannelState,
) {
  if (!shouldPollNodeGenerations(generations)) return false;
  return eventChannelState === "connected"
    ? CONNECTED_SAFETY_POLL_INTERVAL_MS
    : FALLBACK_POLL_INTERVAL_MS;
}

export function useNodeGenerations(
  graphId: string | null,
  nodeId: string | null,
) {
  const eventChannelState = useGenerationEventChannelState();
  return useQuery({
    queryKey: nodeGenerationKeys.list(graphId ?? "none", nodeId ?? "none"),
    queryFn: ({ signal }) =>
      listNodeGenerations(graphId as string, nodeId as string, signal),
    enabled: Boolean(graphId && nodeId),
    refetchInterval: (query) =>
      nodeGenerationRefetchInterval(query.state.data, eventChannelState),
  });
}

export function useExecuteNodeGeneration() {
  const queryClient = useQueryClient();
  const inFlightRef = useRef(false);
  return useMutation({
    mutationFn: async ({
      graphId,
      nodeId,
      expectedGraphVersion,
    }: {
      graphId: string;
      nodeId: string;
      expectedGraphVersion: number;
    }) => {
      if (inFlightRef.current) {
        throw new NodeGenerationApiError(409, "NODE_GENERATION_ACTIVE");
      }
      inFlightRef.current = true;
      try {
        return await executeNodeGeneration(
          graphId,
          nodeId,
          expectedGraphVersion,
        );
      } finally {
        inFlightRef.current = false;
      }
    },
    onSuccess: async (_generation, variables) => {
      await queryClient.invalidateQueries({
        queryKey: nodeGenerationKeys.list(variables.graphId, variables.nodeId),
      });
    },
  });
}
