// @vitest-environment node

import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptModelApiKey, encryptModelApiKey } from "./model-credential";

afterEach(() => vi.unstubAllEnvs());

describe("LLM credential encryption", () => {
  it("stores only authenticated ciphertext and detects tampering", () => {
    vi.stubEnv("MODEL_CREDENTIAL_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    const secret = "sk-test-never-expose-this-value";
    const encrypted = encryptModelApiKey(secret);
    expect(JSON.stringify(encrypted)).not.toContain(secret);
    expect(decryptModelApiKey(encrypted)).toBe(secret);
    expect(() => decryptModelApiKey({ ...encrypted, ciphertext: randomBytes(30).toString("base64") })).toThrow();
  });

  it("refuses key writes without a valid server encryption key", () => {
    vi.stubEnv("MODEL_CREDENTIAL_ENCRYPTION_KEY", "");
    expect(() => encryptModelApiKey("sk-test")).toThrow("MODEL_CREDENTIAL_ENCRYPTION_KEY_MISSING");
    vi.stubEnv("MODEL_CREDENTIAL_ENCRYPTION_KEY", "invalid");
    expect(() => encryptModelApiKey("sk-test")).toThrow("MODEL_CREDENTIAL_ENCRYPTION_KEY_INVALID");
  });
});
