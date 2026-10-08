import { z } from "zod";
import { updateApiKeyLabel } from "@/server/api-key/lib/api-key-service";
import { apiKeyPermissionsSchema } from "@/shared/api/platform-permissions";

const updatePayloadSchema = z.object({
  label: z.string().trim().min(1).max(80),
  permissions: apiKeyPermissionsSchema.optional(),
});

export async function updateApiKeyLabelHandler(params: {
  id: string;
  ownerEmail: string;
  payload: unknown;
}) {
  const parsed = updatePayloadSchema.safeParse(params.payload);
  if (!parsed.success) {
    const error = new Error("INVALID_PAYLOAD");
    (error as Error & { details?: unknown }).details = parsed.error.flatten();
    throw error;
  }

  const record = await updateApiKeyLabel({
    id: params.id,
    ownerEmail: params.ownerEmail,
    label: parsed.data.label.trim(),
    permissions: parsed.data.permissions,
  });

  return { record };
}
