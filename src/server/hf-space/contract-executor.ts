
import { handle_file } from "@gradio/client";
import { assertGradioExecutable, getGradioContract, gradioInputValues, selectGradioOutput, type GradioContract } from "@/shared/model-catalog/gradio-contract";
import { selectPreferredHfSpaceFileReference } from "@/server/hf-space/file-reference-resolver";

export async function buildGradioRequest(contract: GradioContract, payload: { prompt?: string; dynamicParams?: Record<string, unknown> }) {
  assertGradioExecutable(contract);

  const values = gradioInputValues(contract, payload);
  for (const field of contract.inputs) {
    const value = values[field.name];
    if (value == null || !["file", "files", "gallery"].includes(field.kind)) continue;
    const convert = async (source: string) => {
      if (/^data:(image|audio|video)\/[^;]+;base64,/.test(source)) {
        const comma = source.indexOf(",");
        const mime = source.slice(5, source.indexOf(";"));
        if (field.media && !mime.startsWith(field.media + "/")) throw new Error("HF_CONTRACT_FILE_MEDIA");
        return handle_file(new Blob([Buffer.from(source.slice(comma + 1), "base64")], { type: mime }));
      }
      const url = new URL(source);
      if (url.protocol !== "https:" || url.username || url.password ||
          /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/i.test(url.hostname) ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname) || !url.hostname.includes("."))
        throw new Error("HF_CONTRACT_FILE_URL");
      return handle_file(url.href);
    };
    if (field.kind === "file") values[field.name] = await convert(value as string);
    else {
      const files = await Promise.all((value as string[]).map(convert));
      values[field.name] = field.kind === "gallery" ? files.map(image => ({image, caption:null})) : files;
    }
  }
  return values;
}
export async function executeGradioContract(
  client: { predict: (api: string, values: Record<string, unknown>) => Promise<{data: unknown}> },
  model: {providerConfig?: unknown; parameters?: unknown},
  payload: {prompt?: string; dynamicParams?: Record<string, unknown>},
  config: {timeoutMs: number; spaceUrl: string},
  media: "image" | "video" | "audio",
) {
  const contract = getGradioContract(model);
  if (!contract || contract.output?.media !== media) throw new Error("HF_CONTRACT_MEDIA");
  const request = await buildGradioRequest(contract, payload);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    client.predict(contract.apiName, request),
    new Promise<never>((_, reject) => {timer=setTimeout(()=>reject(new Error("HF_SPACE_REQUEST_TIMEOUT")), config.timeoutMs);}),
  ]).finally(()=>clearTimeout(timer));
  const selected = selectGradioOutput(result.data, contract);
  const items = contract.output.multiple && Array.isArray(selected) ? selected : [selected];
  if (!items.length) throw new Error("HF_CONTRACT_OUTPUT_MISSING");
  return items.map(item => {
    const ref = selectPreferredHfSpaceFileReference(item,{spaceUrl:config.spaceUrl,maxDepth:8});
    if (!ref) throw new Error("HF_SPACE_RESPONSE_INVALID");
    return ref;
  });
}
