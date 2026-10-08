// @vitest-environment node
import { expect, it } from "vitest";
import { projectExternalAdminModel } from "./external-model-projection";
it("redacts credentials and machine configuration recursively while preserving model settings", () => {
  const result = projectExternalAdminModel({ id: "id", type: "image", key: "image", label: "Image", vendor: "VENDOR", provider: "codex_cli",
    providerConfig: { command: "private-command", token_env: "PRIVATE_TOKEN", unknown_config: "private-config", model_id: "model", base_url: "https://user:password@example.com/v1?api_key=never&version=1" },
    parameters: { seed: { default: 1, nested: { access_token: "never", max_tokens: 10 } } },
    meta: { nested: [{ secret: "never", info: "safe" }], authorization: "never" }, createdAt: new Date(0), updatedAt: new Date(0), apiKey: "never", credential: { ciphertext: "never" }, hasApiKey: true,
  });
  expect(result.providerConfig).toEqual({ model_id: "model", base_url: "https://example.com/v1?version=1" });
  expect(result.parameters).toEqual({ seed: { default: 1, nested: { max_tokens: 10 } } });
  expect(result.meta).toEqual({ nested: [{ info: "safe" }] });
  expect(JSON.stringify(result)).not.toMatch(/never|private|password/);
});
