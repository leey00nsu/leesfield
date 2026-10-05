import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type { ImageGenerationResponse, ImageGenerationStatus } from "@/features/image-generation/model/image-generation-types";
import { fetchImageGenerationStatus, requestImageGeneration } from "@/features/image-generation/api/image-generation-api";
import type { GenerationPollingState } from "@/shared/lib/hooks/use-generation-polling";
import { createSubmissionIntent } from "@/shared/api/submission-intent";
import { isGenerationRepeatCount } from "@/shared/generation/generation-repeat";

const POLL_INTERVAL_MS = 1200;
const configuredTimeoutMs = Number(process.env.NEXT_PUBLIC_IMAGE_TIMEOUT_MS ?? 300_000);
const pollTimeoutMs = (Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0 ? configuredTimeoutMs : 300_000) + 30_000;
type ResultImage = NonNullable<ImageGenerationResponse["result"]>["images"][number] & { requestId?: string; outputIndex?: number };
export type ImageGenerationState = Omit<GenerationPollingState<ImageGenerationStatus, ImageGenerationResponse["result"]>, "result"> & {
  result?: { images: ResultImage[] };
  batch?: { total: number; finished: number; failed: number };
};

function delay(signal: AbortSignal) {
  return new Promise<void>(resolve => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
    const timer = setTimeout(finish, POLL_INTERVAL_MS);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}

export function useImageGeneration(modelTimeoutMs?: number) {
  const tErrors = useTranslations("generation.errors");
  const [state, setState] = useState<ImageGenerationState>({ status: "idle", progress: 0 });
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  const reset = useCallback(() => {
    active.current?.abort(); active.current = null;
    setState({ status: "idle", progress: 0 });
  }, []);

  const startGeneration = useCallback(async (values: ImageGenerationFormValues, repetitions = 1) => {
    if (active.current || !isGenerationRepeatCount(repetitions)) return;
    const snapshot = structuredClone(values);
    const controller = new AbortController();
    active.current = controller;
    const valid = () => active.current === controller && !controller.signal.aborted;
    const timeoutMs = modelTimeoutMs ? Math.max(pollTimeoutMs, modelTimeoutMs + 120_000) : pollTimeoutMs;
    setState({ status: "pending", progress: 0, batch: { total: repetitions, finished: 0, failed: 0 } });
    // Return after starting, preserving the existing form's nonblocking submit contract.
    void (async () => {
      const images: ResultImage[] = [];
      let failed = 0;
      let lastError: string | undefined;
      let lastId: string | undefined;
      for (let index = 0; index < repetitions && valid(); index++) {
        const started = Date.now();
        const call = new AbortController();
        const abortCall = () => call.abort();
        controller.signal.addEventListener("abort", abortCall, {once:true});
        let timedOut = false;
        const timeout = setTimeout(() => { timedOut = true; call.abort(); }, timeoutMs);
        const update = (response: ImageGenerationResponse) => {
          if (!valid()) return;
          setState({ status: "processing", requestId: response.requestId,
            progress: (index * 100 + response.progress) / repetitions,
            result: images.length ? { images: [...images] } : undefined,
            batch: { total: repetitions, finished: index, failed } });
        };
        try {
          const key = createSubmissionIntent().take(JSON.stringify(snapshot));
          let response: ImageGenerationResponse;
          try { response = await requestImageGeneration(structuredClone(snapshot), { idempotencyKey: key, signal: call.signal }); }
          catch { throw new Error(tErrors("requestFailed")); }
          if (!valid()) return;
          if (timedOut) throw new Error(tErrors("timeout"));
          lastId = response.requestId;
          update(response);
          while (response.status !== "completed" && response.status !== "failed" && valid()) {
            if (timedOut || Date.now() - started > timeoutMs) throw new Error(tErrors("timeout"));
            try { response = await fetchImageGenerationStatus(lastId, call.signal); }
            catch { throw new Error(tErrors("pollFailed")); }
            if (!valid()) return;
            if (timedOut) throw new Error(tErrors("timeout"));
            update(response);
            if (response.status !== "completed" && response.status !== "failed") await delay(call.signal);
          }
          if (!valid()) return;
          if (response.status === "failed") throw new Error(response.errorMessage ?? tErrors("requestFailed"));
          if (!response.result?.images.length) throw new Error(tErrors("requestFailed"));
          images.push(...(response.result?.images ?? []).map((image, outputIndex) => ({ ...image, requestId: response.requestId, outputIndex })));
        } catch (error) {
          if (!valid()) return;
          failed++;
          lastError = timedOut ? tErrors("timeout") : error instanceof Error ? error.message : tErrors("requestFailed");
        } finally {
          clearTimeout(timeout);
          controller.signal.removeEventListener("abort", abortCall);
        }
        if (!valid()) return;
        const finished = index + 1;
        setState({ status: finished < repetitions ? "processing" : images.length ? "completed" : "failed",
          requestId: lastId, progress: finished * 100 / repetitions,
          result: images.length ? { images: [...images] } : undefined,
          errorMessage: lastError, batch: { total: repetitions, finished, failed } });
      }
      if (valid()) active.current = null;
    })();
  }, [modelTimeoutMs, tErrors]);
  return { state, startGeneration, reset };
}
