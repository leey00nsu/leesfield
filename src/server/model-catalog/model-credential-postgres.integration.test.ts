// @vitest-environment node

import { randomBytes, randomUUID } from "node:crypto";
import { vi } from "vitest";
import { GET as getAdminModels } from "@/app/api/admin/models/route";
import { GET as getModels } from "@/app/api/models/route";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { getModelCatalog, invalidateModelCatalogCache } from "./catalog-service";
import { createModelCatalogHandler } from "./handlers/create-model-catalog";
import { updateModelCatalogHandler } from "./handlers/update-model-catalog";
import { getLlmModelApiKey } from "./model-credential";

vi.mock("@/server/auth/session", () => ({
  getSession: vi.fn(async () => ({ isLoggedIn: true, adminEmail: "admin@example.com" })),
}));

describe.skipIf(!postgresIntegrationEnabled)("LLM credential catalog persistence", () => {
  const key = `assistant-${randomUUID()}`;
  const previousEncryptionKey = process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY;

  beforeAll(() => { process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("base64"); });
  afterAll(async () => {
    await prisma.modelCatalog.deleteMany({ where: { key } });
    invalidateModelCatalogCache();
    if (previousEncryptionKey === undefined) delete process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY = previousEncryptionKey;
  });

  it("creates, masks, retains, replaces, and disables a model key", async () => {
    const firstKey = "sk-test-first-secret";
    const created = await createModelCatalogHandler({
      type: "llm", key, label: "Assistant", vendor: "OPENAI", provider: "openai_compatible",
      providerConfig: { base_url: "https://api.openai.com/v1", model_id: "gpt-4.1", supports_images: true },
      parameters: {}, meta: {}, isActive: true, isDefault: false, apiKey: firstKey,
    });
    expect(created).toMatchObject({ type: "llm", hasApiKey: true });
    const raw = await prisma.modelCredential.findUniqueOrThrow({ where: { modelId: created.id } });
    expect(JSON.stringify(raw)).not.toContain(firstKey);
    expect(await getLlmModelApiKey(key)).toBe(firstKey);

    const listed = await getModelCatalog({ includeInactive: true, bypassCache: true });
    expect(listed.find((item) => item.key === key)).toMatchObject({ type: "llm", hasApiKey: true });
    expect(JSON.stringify(listed)).not.toContain(firstKey);
    for (const [handler, url] of [
      [getAdminModels, "http://localhost/api/admin/models?type=llm"],
      [getModels, "http://localhost/api/models?type=llm"],
    ] as const) {
      const response = await handler(new Request(url));
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain(key);
      expect(body).toContain('"hasApiKey":true');
      expect(body).not.toContain(firstKey);
    }

    await updateModelCatalogHandler({ key, payload: { label: "Assistant updated" } });
    expect(await getLlmModelApiKey(key)).toBe(firstKey);
    const secondKey = "sk-test-replacement-secret";
    await updateModelCatalogHandler({ key, payload: { apiKey: secondKey } });
    expect(await getLlmModelApiKey(key)).toBe(secondKey);
    expect((await prisma.modelCredential.findUniqueOrThrow({ where: { modelId: created.id } })).ciphertext).not.toBe(raw.ciphertext);

    await updateModelCatalogHandler({ key, payload: { isActive: false } });
    await expect(getLlmModelApiKey(key)).rejects.toThrow("LLM_MODEL_UNAVAILABLE");
    expect((await getModelCatalog({ bypassCache: true })).some((item) => item.key === key)).toBe(false);
    expect(JSON.stringify(await getModelCatalog({ includeInactive: true, bypassCache: true }))).not.toContain(secondKey);
  });
});
