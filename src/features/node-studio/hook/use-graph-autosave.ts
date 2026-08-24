"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import {
  GenerationGraphApiError,
  updateGenerationGraph,
} from "../api/generation-graph-api";
import type {
  GenerationGraphSnapshotDto,
  UpdateGenerationGraphDto,
} from "../model/graph-types";

export type GraphDraft = Omit<UpdateGenerationGraphDto, "expectedVersion">;
export type GraphAutosaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";

export type GraphAutosaveSnapshot = {
  status: GraphAutosaveStatus;
  version: number;
};

export class GraphAutosaveSaveError extends Error {
  constructor(public readonly status: "error" | "conflict" | "stopped") {
    super(`GRAPH_AUTOSAVE_${status.toUpperCase()}`);
    this.name = "GraphAutosaveSaveError";
  }
}

type SaveGraph = (
  graphId: string,
  draft: UpdateGenerationGraphDto,
  signal: AbortSignal,
) => Promise<GenerationGraphSnapshotDto>;

type GraphAutosaveControllerOptions = {
  graphId: string;
  initialVersion: number;
  initialDraft: GraphDraft;
  save: SaveGraph;
  onSaved?: (graph: GenerationGraphSnapshotDto) => void;
  delayMs?: number;
};

function signature(draft: GraphDraft) {
  return JSON.stringify(draft);
}

export class GraphAutosaveController {
  private graphId: string;
  private version: number;
  private latestDraft: GraphDraft;
  private latestSignature: string;
  private revision = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private request: AbortController | null = null;
  private inFlight = false;
  private stopped = false;
  private session = 0;
  private listeners = new Set<() => void>();
  private snapshot: GraphAutosaveSnapshot;
  private readonly save: SaveGraph;
  private readonly onSaved?: (graph: GenerationGraphSnapshotDto) => void;
  private readonly delayMs: number;
  private waiters = new Set<{
    resolve: (snapshot: GraphAutosaveSnapshot) => void;
    reject: (error: GraphAutosaveSaveError) => void;
  }>();

  constructor(options: GraphAutosaveControllerOptions) {
    this.graphId = options.graphId;
    this.version = options.initialVersion;
    this.latestDraft = options.initialDraft;
    this.latestSignature = signature(options.initialDraft);
    this.save = options.save;
    this.onSaved = options.onSaved;
    this.delayMs = options.delayMs ?? 650;
    this.snapshot = { status: "saved", version: options.initialVersion };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  start() {
    this.stopped = false;
  }

  private emit(status: GraphAutosaveStatus) {
    this.snapshot = { status, version: this.version };
    for (const listener of this.listeners) listener();
    if (status === "saved") this.resolveWaiters();
    if (status === "error" || status === "conflict") {
      this.rejectWaiters(new GraphAutosaveSaveError(status));
    }
  }

  private resolveWaiters() {
    for (const waiter of this.waiters) waiter.resolve(this.snapshot);
    this.waiters.clear();
  }

  private rejectWaiters(error: GraphAutosaveSaveError) {
    for (const waiter of this.waiters) waiter.reject(error);
    this.waiters.clear();
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delayMs = this.delayMs) {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delayMs);
  }

  update(draft: GraphDraft) {
    if (this.stopped) return;
    const nextSignature = signature(draft);
    if (nextSignature === this.latestSignature) return;
    this.latestDraft = draft;
    this.latestSignature = nextSignature;
    this.revision += 1;

    if (this.snapshot.status === "conflict" || this.snapshot.status === "error") return;
    if (!this.inFlight) this.emit("dirty");
    this.schedule();
  }

  retry() {
    if (this.stopped || this.snapshot.status !== "error") return;
    this.emit("dirty");
    this.schedule(0);
  }

  saveNow() {
    if (this.stopped) {
      return Promise.reject(new GraphAutosaveSaveError("stopped"));
    }
    if (this.snapshot.status === "error" || this.snapshot.status === "conflict") {
      return Promise.reject(new GraphAutosaveSaveError(this.snapshot.status));
    }
    if (this.snapshot.status === "saved" && !this.inFlight) {
      return Promise.resolve(this.snapshot);
    }

    this.clearTimer();
    const completion = new Promise<GraphAutosaveSnapshot>((resolve, reject) => {
      this.waiters.add({ resolve, reject });
    });
    if (!this.inFlight) void this.flush();
    return completion;
  }

  reset(options: { graphId: string; version: number; draft: GraphDraft }) {
    this.rejectWaiters(new GraphAutosaveSaveError("stopped"));
    this.clearTimer();
    this.request?.abort();
    this.session += 1;
    this.graphId = options.graphId;
    this.version = options.version;
    this.latestDraft = options.draft;
    this.latestSignature = signature(options.draft);
    this.revision = 0;
    this.inFlight = false;
    this.request = null;
    this.emit("saved");
  }

  dispose() {
    this.stopped = true;
    this.clearTimer();
    this.request?.abort();
    this.rejectWaiters(new GraphAutosaveSaveError("stopped"));
    this.listeners.clear();
  }

  private async flush() {
    if (this.stopped || this.inFlight) return;
    if (this.snapshot.status === "conflict" || this.snapshot.status === "error") return;

    const capturedRevision = this.revision;
    const capturedSession = this.session;
    const request = new AbortController();
    this.request = request;
    this.inFlight = true;
    this.emit("saving");

    try {
      const graph = await this.save(
        this.graphId,
        { ...this.latestDraft, expectedVersion: this.version },
        request.signal,
      );
      if (this.stopped || capturedSession !== this.session) return;

      this.version = graph.version;
      this.onSaved?.(graph);
      this.inFlight = false;
      this.request = null;
      if (this.revision > capturedRevision) {
        this.emit("dirty");
        this.schedule(0);
      } else {
        this.emit("saved");
      }
    } catch (error) {
      if (this.stopped || capturedSession !== this.session || request.signal.aborted) return;
      this.inFlight = false;
      this.request = null;
      if (error instanceof GenerationGraphApiError && error.code === "GRAPH_VERSION_CONFLICT") {
        this.emit("conflict");
      } else {
        this.emit("error");
      }
    }
  }
}

type UseGraphAutosaveOptions = Omit<GraphAutosaveControllerOptions, "save"> & {
  save?: SaveGraph;
};

export function useGraphAutosave(options: UseGraphAutosaveOptions) {
  const [controller] = useState(
    () =>
      new GraphAutosaveController({
      ...options,
      save: options.save ?? updateGenerationGraph,
      }),
  );

  useEffect(() => {
    controller.start();
    return () => controller.dispose();
  }, [controller]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  return {
    ...state,
    update: (draft: GraphDraft) => controller.update(draft),
    retry: () => controller.retry(),
    saveNow: () => controller.saveNow(),
    reset: (next: { graphId: string; version: number; draft: GraphDraft }) => controller.reset(next),
  };
}
