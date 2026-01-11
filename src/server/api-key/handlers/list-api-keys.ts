import { listApiKeys } from "@/server/api-key/lib/api-key-service";

export async function listApiKeysHandler(ownerEmail: string) {
  const items = await listApiKeys(ownerEmail);
  return { items };
}
