import { z } from "zod";
import { issueApiKey } from "@/server/api-key/lib/api-key-service";

const issuePayloadSchema = z.object({
  label: z.string().trim().min(1).max(80),
});

export async function issueApiKeyHandler(params: {
  ownerEmail: string;
  payload: unknown;
}) {
  const parsed = issuePayloadSchema.safeParse(params.payload);
  if (!parsed.success) {
    const error = new Error("INVALID_PAYLOAD");
    (error as Error & { details?: unknown }).details = parsed.error.flatten();
    throw error;
  }

  return issueApiKey({
    ownerEmail: params.ownerEmail,
    label: parsed.data.label.trim(),
  });
}
