"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { generationEventId } from "@/shared/generation-events/generation-event-contract";

import {
  browserGenerationEventSource,
  generationEventUrl,
  parseGenerationEventMessage,
  type GenerationEventSource,
  type GenerationEventSourceFactory,
} from "../api/generation-event-client";
import { nodeExecutionKeys } from "./use-node-executions";
import {
  GenerationEventChannelProviderValue,
  type GenerationEventChannelState,
} from "../model/generation-event-channel-context";

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 35_000;

type Props = {
  graphId: string;
  children: ReactNode;
  eventSourceFactory?: GenerationEventSourceFactory;
  random?: () => number;
};

export function GenerationEventChannelProvider({
  graphId,
  children,
  eventSourceFactory = browserGenerationEventSource,
  random = Math.random,
}: Props) {
  const queryClient = useQueryClient();
  const [state, setState] =
    useState<GenerationEventChannelState>("connecting");

  useEffect(() => {
    let stopped = false;
    let source: GenerationEventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    const seenEventIds = new Set<string>();
    const latestExecutionEventAt = new Map<string, number>();

    const clearWatchdog = () => {
      if (watchdogTimer) clearTimeout(watchdogTimer);
      watchdogTimer = null;
    };

    const clearRetry = () => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
    };

    const invalidateGraphQueries = () => {
      void queryClient.invalidateQueries({
        queryKey: nodeExecutionKeys.graph(graphId),
        refetchType: "active",
      });
    };

    const acceptEvent = (event: NonNullable<ReturnType<typeof parseGenerationEventMessage>>) => {
      const eventId = `${event.type}:${generationEventId(event)}`;
      if (seenEventIds.has(eventId)) return false;
      seenEventIds.add(eventId);
      if (seenEventIds.size > 256) {
        const oldest = seenEventIds.values().next().value;
        if (oldest) seenEventIds.delete(oldest);
      }
      const executionKey = `${event.type}:${event.executionId}`;
      const updatedAt = Date.parse(event.updatedAt);
      const latest = latestExecutionEventAt.get(executionKey);
      if (latest !== undefined && updatedAt < latest) return false;
      latestExecutionEventAt.set(executionKey, updatedAt);
      return true;
    };

    const scheduleReconnect = () => {
      if (stopped || retryTimer) return;
      const exponential = Math.min(
        RECONNECT_MAX_MS,
        RECONNECT_BASE_MS * 2 ** reconnectAttempt,
      );
      const delay = Math.max(
        1,
        Math.round(exponential * (0.75 + random() * 0.5)),
      );
      reconnectAttempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, delay);
    };

    const fail = (failedSource: GenerationEventSource) => {
      if (source !== failedSource) return;
      source = null;
      failedSource.close();
      clearWatchdog();
      setState("fallback");
      scheduleReconnect();
    };

    const resetWatchdog = (activeSource: GenerationEventSource) => {
      clearWatchdog();
      watchdogTimer = setTimeout(
        () => fail(activeSource),
        HEARTBEAT_TIMEOUT_MS,
      );
    };

    function connect() {
      if (stopped || source) return;
      setState("connecting");
      const nextSource = eventSourceFactory(generationEventUrl(graphId));
      if (!nextSource) {
        setState("fallback");
        return;
      }
      source = nextSource;

      nextSource.addEventListener("stream.ready", () => {
        if (source !== nextSource) return;
        reconnectAttempt = 0;
        setState("connected");
        resetWatchdog(nextSource);
        invalidateGraphQueries();
      });
      nextSource.addEventListener("stream.heartbeat", () => {
        if (source === nextSource) resetWatchdog(nextSource);
      });
      nextSource.addEventListener("node-execution.updated", (message) => {
        if (source !== nextSource) return;
        resetWatchdog(nextSource);
        const event = parseGenerationEventMessage(message.data);
        if (
          !event ||
          event.type !== "node-execution.updated" ||
          event.graphId !== graphId ||
          !acceptEvent(event)
        ) return;
        void queryClient.invalidateQueries({
          queryKey: nodeExecutionKeys.list(graphId, event.graphNodeId),
        });
      });
      nextSource.addEventListener("stream.degraded", () => fail(nextSource));
      nextSource.onerror = () => fail(nextSource);
    }

    connect();
    return () => {
      stopped = true;
      clearRetry();
      clearWatchdog();
      source?.close();
      source = null;
    };
  }, [eventSourceFactory, graphId, queryClient, random]);

  return (
    <GenerationEventChannelProviderValue value={state}>
      {children}
    </GenerationEventChannelProviderValue>
  );
}
