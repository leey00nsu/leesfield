"use client";
import { ProviderCodeBlock } from "./provider-code-block";
import { useLandingReducedMotion } from "./use-landing-reduced-motion";
import { useEffect, useState, useSyncExternalStore } from "react";
const subscribe = () => () => {};
import { ModelList } from "@/features/model-management/ui/model-list";
import type { ModelCatalogItem } from "@/features/model-management/model/model-catalog";
import { MonitoringRequestTable } from "@/features/monitoring-dashboard/ui/monitoring-request-table";
import { MonitoringStatsChart } from "@/features/monitoring-dashboard/ui/monitoring-stats-chart";
import type {
  MonitoringStatsRow,
  MonitoringRequestItem,
} from "@/features/monitoring-dashboard/model/types";
// Non-production fixtures from the existing product Storybook. No API reads or mutations.
const modelItems: ModelCatalogItem[] = [
  {
    type: "image",
    key: "krea-2",
    label: "Krea 2",
    vendor: "Krea",
    provider: "hf-space",
    isActive: true,
    isDefault: true,
    meta: {
      pipeline: "image_generation",
      modelId: "krea-2",
      defaultWidth: 1024,
      defaultHeight: 1024,
      defaultSteps: 30,
      maxInputImages: 4,
    },
  },
  {
    type: "video",
    key: "wan-2-2",
    label: "Wan 2.2",
    vendor: "HuggingFace",
    provider: "hf-space",
    isActive: true,
    isDefault: false,
    meta: {
      supportsInitImage: true,
      t2vModelId: "wan-t2v",
      i2vModelId: "wan-i2v",
      defaultWidth: 1280,
      defaultHeight: 720,
      defaultDurationSec: 5,
      defaultFps: 16,
      defaultSteps: 28,
      defaultGuidanceScale: 7.5,
    },
  },
  {
    type: "audio",
    key: "qwen-tts",
    label: "Qwen TTS",
    vendor: "HuggingFace",
    provider: "hf-space",
    isActive: false,
    isDefault: false,
    meta: {
      modelId: "qwen-tts",
      defaultSpeed: 1,
      supportsInputAudio: false,
    },
  },
];

const stats: MonitoringStatsRow[] = [
  {
    day: "2026-04-23",
    total: 92,
    failed: 2,
    errorRate: 0.021,
    avgLatencyMs: 1250,
    p95LatencyMs: 2100,
  },
  {
    day: "2026-04-24",
    total: 118,
    failed: 1,
    errorRate: 0.008,
    avgLatencyMs: 1180,
    p95LatencyMs: 1980,
  },
  {
    day: "2026-04-25",
    total: 104,
    failed: 3,
    errorRate: 0.028,
    avgLatencyMs: 1320,
    p95LatencyMs: 2240,
  },
  {
    day: "2026-04-26",
    total: 136,
    failed: 2,
    errorRate: 0.014,
    avgLatencyMs: 1090,
    p95LatencyMs: 1840,
  },
  {
    day: "2026-04-27",
    total: 161,
    failed: 4,
    errorRate: 0.024,
    avgLatencyMs: 1210,
    p95LatencyMs: 2030,
  },
  {
    day: "2026-04-28",
    total: 148,
    failed: 1,
    errorRate: 0.006,
    avgLatencyMs: 990,
    p95LatencyMs: 1720,
  },
  {
    day: "2026-04-29",
    total: 176,
    failed: 3,
    errorRate: 0.017,
    avgLatencyMs: 1040,
    p95LatencyMs: 1810,
  },
];

const requests: MonitoringRequestItem[] = [
  {
    id: "req_001",
    type: "image",
    status: "completed",
    model: "GPT Image 2",
    createdAt: "2026-04-29T12:40:00.000Z",
    durationMs: 18000,
    apiKeyLabel: "Production key",
  },
  {
    id: "req_002",
    type: "video",
    status: "processing",
    model: "Wan 2.2",
    createdAt: "2026-04-29T12:44:00.000Z",
    durationMs: 64000,
    apiKeyLabel: "Production key",
  },
  {
    id: "req_003",
    type: "audio",
    status: "failed",
    model: "Qwen TTS",
    createdAt: "2026-04-29T12:48:00.000Z",
    durationMs: 9200,
    apiKeyLabel: "Staging key",
  },
];

// Excerpt from server/image-generation/image-generation.ts:getAdapter.
const providerCode =
  'const provider =\n  await resolveImageProvider(modelKey);\n\nif (provider === "hf_space")\n  return hfSpaceImageAdapter;\n\nif (provider === "codex_bridge")\n  return codexBridgeImageAdapter;';
export function LandingProductPreview({ kind }: { kind: string }) {
  const reduced = useLandingReducedMotion();
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    if (kind !== "jobs" || reduced) return;
    const startedAt = performance.now();
    const timer = setInterval(() => {
      setElapsedMs((performance.now() - startedAt) % 11500);
    }, 100);
    return () => clearInterval(timer);
  }, [kind, reduced]);
  // Three 2.5-second jobs, followed by a four-second completed pause.
  const elapsed = reduced ? 0 : elapsedMs;
  const stage = Math.min(3, Math.floor(elapsed / 2500));
  const animatedRequests = requests.map((request, index) => ({
    ...request,
    status:
      index < stage ? "completed" : index === stage ? "processing" : "pending",
    durationMs:
      index < stage ? 2500 : index === stage ? Math.floor(elapsed % 2500) : null,
  }));
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <div
      aria-hidden={kind === "api" ? undefined : true}
      inert={kind !== "api"}
      data-job-preview-stage={kind === "jobs" ? stage : undefined}
      style={kind === "api" ? {maskImage: "none"} : undefined}
      className="relative h-[300px] w-full overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent),linear-gradient(to_right,black_75%,transparent)] [mask-composite:intersect]"
    >
      <div
        className={
          "absolute origin-top-left " +
          (kind === "api" ? "pointer-events-auto" : "pointer-events-none")
        }
        style={{
          width: kind === "jobs" ? 1000 : kind === "api" ? "calc(100% - 32px)" : 760,
          left: kind === "jobs" ? -580 : kind === "api" ? 16 : 28,
          top: kind === "jobs" ? -40 : 28,
        }}
      >
        {!mounted ? null : kind === "catalog" ? (
          <ModelList items={modelItems} />
        ) : kind === "jobs" ? (
          <MonitoringRequestTable
            items={animatedRequests}
            total={requests.length}
            limit={20}
            offset={0}
            onLimitChange={() => {}}
            onOffsetChange={() => {}}
            isLoading={false}
            error={null}
            updatedAt="2026-04-29T12:50:00.000Z"
            timeZone="Asia/Seoul"
          />
        ) : kind === "monitor" ? (
          <MonitoringStatsChart data={stats} isLoading={false} />
        ) : (
          <ProviderCodeBlock source={providerCode} />
        )}
      </div>
    </div>
  );
}
