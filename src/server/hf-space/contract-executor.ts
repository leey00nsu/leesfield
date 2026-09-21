
import { handle_file } from "@gradio/client";
import { assertGradioExecutable, getGradioContract, gradioInputValues, selectGradioOutput, type GradioContract } from "@/shared/model-catalog/gradio-contract";
import { selectPreferredHfSpaceFileReference } from "@/server/hf-space/file-reference-resolver";
import { resolveInputImageBuffer } from "@/server/shared/input-image-resolver";
import {
  assertOutputCount,
  decodeBase64DataUrl,
  GENERATION_OUTPUT_LIMITS,
  OUTBOUND_CONCURRENCY,
  OUTBOUND_FILE_TIMEOUT_MS,
} from "@/server/http/bounded-io";
import { mapWithConcurrency } from "@/server/http/bounded-body";
import { measureProvider } from "@/server/observability/request-observability";

type GradioEvent = {
  type?: string;
  data?: unknown;
  stage?: string;
  message?: unknown;
};

type GradioSubmission = AsyncIterable<GradioEvent> & {
  cancel?: () => Promise<void>;
};

type GradioPredictionClient = {
  predict: (api: string, values: Record<string, unknown>) => Promise<{ data: unknown }>;
  submit?: (api: string, values: Record<string, unknown>) => GradioSubmission;
};

async function collectGradioSubmission(submission: GradioSubmission) {
  let latestData: { data: unknown } | undefined;
  let completed = false;

  for await (const message of submission) {
    if (message.type === "data") {
      latestData = { data: message.data };
      if (completed) return latestData;
    }
    if (message.type === "status") {
      if (message.stage === "error") {
        throw new Error(
          typeof message.message === "string"
            ? message.message
            : "HF_SPACE_REQUEST_FAILED",
        );
      }
      if (message.stage === "complete") {
        completed = true;
        if (latestData) return latestData;
      }
    }
  }

  if (latestData) return latestData;
  throw new Error("HF_SPACE_RESPONSE_INVALID");
}

/**
 * Gradio's predict helper does not expose cancellation. Prefer submit(),
 * whose iterable can cancel the remote queue job, and retain predict() as a
 * compatibility path for the small test/client doubles used by this app.
 */
export function predictWithDeadline(
  client: GradioPredictionClient,
  api: string,
  values: Record<string, unknown>,
  timeoutMs: number,
) {
  return measureProvider("hf_space", () =>
    predictWithDeadlineInternal(client, api, values, timeoutMs),
  );
}

async function predictWithDeadlineInternal(
  client: GradioPredictionClient,
  api: string,
  values: Record<string, unknown>,
  timeoutMs: number,
) {
  let submission: GradioSubmission | undefined;
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const task = (async () => {
    if (client.submit) {
      submission = client.submit(api, values);
      return collectGradioSubmission(submission);
    }
    return client.predict(api, values);
  })();

  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          timedOut = true;
          reject(new Error("HF_SPACE_REQUEST_TIMEOUT"));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (timedOut) {
      // Do not extend the caller's deadline waiting for a best-effort remote
      // cancellation request. The provider may still finish remotely.
      void submission?.cancel?.().catch(() => undefined);
      throw new Error("HF_SPACE_REQUEST_TIMEOUT");
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function buildGradioRequest(contract: GradioContract, payload: { prompt?: string; dynamicParams?: Record<string, unknown> }) {
  assertGradioExecutable(contract);

  const values = gradioInputValues(contract, payload);
  for (const field of contract.inputs) {
    const value = values[field.name];
    if (value == null || !["file", "files", "gallery"].includes(field.kind)) continue;
    const convert = async (source: string) => {
      if (/^data:(image|audio|video)\/[^;]+;base64,/.test(source)) {
        const media = field.media ?? "image";
        const { contentType, buffer } = decodeBase64DataUrl(source, {
          maxBytes: GENERATION_OUTPUT_LIMITS[media],
          invalidCode: "HF_CONTRACT_FILE_URL",
          tooLargeCode: "HF_CONTRACT_FILE_TOO_LARGE",
        });
        if (field.media && !contentType.startsWith(field.media + "/")) {
          throw new Error("HF_CONTRACT_FILE_MEDIA");
        }
        return handle_file(new Blob([new Uint8Array(buffer)], { type: contentType }));
      }
      const url = new URL(source);
      if (url.protocol !== "https:" || url.username || url.password ||
          /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/i.test(url.hostname) ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname) || !url.hostname.includes("."))
        throw new Error("HF_CONTRACT_FILE_URL");
      const media = field.media ?? "image";
      const resolved = await resolveInputImageBuffer(url.href, {
        invalidErrorCode: "HF_CONTRACT_FILE_URL",
        fetchErrorCode: "HF_CONTRACT_FILE_FETCH_FAILED",
        timeoutMs: OUTBOUND_FILE_TIMEOUT_MS,
        maxBytes: GENERATION_OUTPUT_LIMITS[media],
      });
      if (field.media && !resolved.mime.startsWith(field.media + "/")) {
        throw new Error("HF_CONTRACT_FILE_MEDIA");
      }
      return handle_file(new Blob([new Uint8Array(resolved.buffer)], { type: resolved.mime }));
    };
    if (field.kind === "file") values[field.name] = await convert(value as string);
    else {
      if ((value as string[]).length > 8) throw new Error("HF_CONTRACT_FILE_COUNT_LIMIT");
      const files = await mapWithConcurrency(value as string[], OUTBOUND_CONCURRENCY, convert);
      values[field.name] = field.kind === "gallery" ? files.map(image => ({image, caption:null})) : files;
    }
  }
  return values;
}
export async function executeGradioContract(
  client: GradioPredictionClient,
  model: {providerConfig?: unknown; parameters?: unknown},
  payload: {prompt?: string; dynamicParams?: Record<string, unknown>},
  config: {timeoutMs: number; spaceUrl: string},
  media: "image" | "video" | "audio",
) {
  const contract = getGradioContract(model);
  if (!contract || contract.output?.media !== media) throw new Error("HF_CONTRACT_MEDIA");
  const request = await buildGradioRequest(contract, payload);
  const result = await predictWithDeadline(client, contract.apiName, request, config.timeoutMs);
  const selected = selectGradioOutput(result.data, contract);
  const items = contract.output.multiple && Array.isArray(selected) ? selected : [selected];
  if (!items.length) throw new Error("HF_CONTRACT_OUTPUT_MISSING");
      assertOutputCount(media, items.length);
  return items.map(item => {
    const ref = selectPreferredHfSpaceFileReference(item,{spaceUrl:config.spaceUrl,maxDepth:8});
    if (!ref) throw new Error("HF_SPACE_RESPONSE_INVALID");
    return ref;
  });
}
