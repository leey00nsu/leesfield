import { z } from "zod";
import { requestRemote } from "@/server/http/safe-remote";
import type { AssistantOutputMode } from "@/shared/generation-graph/assistant-output";

export type AssistantVisual = { mimeType: "image/jpeg" | "image/png" | "image/webp"; data: Buffer; label: string };

export class AssistantProviderError extends Error {
  constructor(readonly code: string) { super(code); this.name = "AssistantProviderError"; }
}

const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

export async function completeAssistant(input: {
  baseUrl: string;
  modelId: string;
  apiKey: string;
  timeoutMs: number;
  instruction: string;
  text: string | null;
  visuals: AssistantVisual[];
  signal: AbortSignal;
  outputMode?: AssistantOutputMode;
}) {
  const content: Array<Record<string, unknown>> = [{
    type: "text",
    text: [input.instruction, input.text].filter(Boolean).join("\n\n") || "Describe these references and suggest a creative direction.",
  }];
  for (const visual of input.visuals) {
    content.push({ type: "text", text: visual.label });
    content.push({ type: "image_url", image_url: { url: `data:${visual.mimeType};base64,${visual.data.toString("base64")}` } });
  }
  const url = new URL(input.baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/chat/completions`;
  let response;
  try {
    response = await requestRemote(url.toString(), {
      method: "POST",
      headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: input.modelId, messages: [
        ...(input.outputMode === "list" ? [{ role: "system", content: 'Return only a JSON object with exactly one key: {"items":["first item","second item"]}. Use 1 to 50 nonempty plain text strings, each at most 4000 characters. The complete numbered list must be at most 20000 characters. No prose outside the JSON.' }] : []),
        { role: "user", content: input.visuals.length ? content : content[0].text },
      ], stream: false }),
      timeoutMs: input.timeoutMs,
      maxBytes: 256 * 1024,
      maxRedirects: 0,
      signal: input.signal,
    });
  } catch {
    throw new AssistantProviderError("ASSISTANT_PROVIDER_UNAVAILABLE");
  }
  if (response.status < 200 || response.status >= 300) throw new AssistantProviderError("ASSISTANT_PROVIDER_REJECTED");
  let parsed;
  try { parsed = completionSchema.parse(JSON.parse(response.body.toString("utf8"))); }
  catch { throw new AssistantProviderError("ASSISTANT_RESPONSE_INVALID"); }
  const output = parsed.choices[0].message.content.trim();
  if (!output || output.length > (input.outputMode === "list" ? 200_000 : 20_000)) throw new AssistantProviderError("ASSISTANT_RESPONSE_INVALID");
  return output;
}
