import { revokeApiKey } from "@/server/api-key/lib/api-key-service";

export async function revokeApiKeyHandler(params: {
  id: string;
  ownerEmail: string;
}) {
  const record = await revokeApiKey(params);
  return { record };
}
