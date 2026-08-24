"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createGenerationGraph,
  deleteGenerationGraph,
  getGenerationGraph,
  listGenerationGraphs,
} from "../api/generation-graph-api";
import type {
  GenerationGraphSnapshotDto,
  GenerationGraphSummaryDto,
} from "../model/graph-types";

const graphKeys = {
  list: ["generation-graphs"] as const,
  detail: (graphId: string) => ["generation-graphs", graphId] as const,
};

function toSummary(graph: GenerationGraphSnapshotDto): GenerationGraphSummaryDto {
  const { id, title, version, createdAt, updatedAt } = graph;
  return { id, title, version, createdAt, updatedAt };
}

export function useGenerationGraphList() {
  return useQuery({
    queryKey: graphKeys.list,
    queryFn: ({ signal }) => listGenerationGraphs(signal),
  });
}

export function useGenerationGraph(graphId: string | null) {
  return useQuery({
    queryKey: graphKeys.detail(graphId ?? "none"),
    queryFn: ({ signal }) => getGenerationGraph(graphId as string, signal),
    enabled: Boolean(graphId),
  });
}

export function useCreateGenerationGraph() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => createGenerationGraph(title),
    onSuccess: (graph) => {
      queryClient.setQueryData(graphKeys.detail(graph.id), graph);
      queryClient.setQueryData<GenerationGraphSummaryDto[]>(graphKeys.list, (current = []) => [
        toSummary(graph),
        ...current.filter((item) => item.id !== graph.id),
      ]);
    },
  });
}

export function useDeleteGenerationGraph() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (graphId: string) => deleteGenerationGraph(graphId),
    onSuccess: (_result, graphId) => {
      queryClient.removeQueries({ queryKey: graphKeys.detail(graphId) });
      queryClient.setQueryData<GenerationGraphSummaryDto[]>(graphKeys.list, (current = []) =>
        current.filter((item) => item.id !== graphId),
      );
    },
  });
}

export function useSyncGenerationGraphCache() {
  const queryClient = useQueryClient();
  return useCallback(
    (graph: GenerationGraphSnapshotDto) => {
      queryClient.setQueryData(graphKeys.detail(graph.id), graph);
      queryClient.setQueryData<GenerationGraphSummaryDto[]>(graphKeys.list, (current = []) => {
        const summary = toSummary(graph);
        return [summary, ...current.filter((item) => item.id !== graph.id)].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt),
        );
      });
    },
    [queryClient],
  );
}
