import { describe, expect, it } from "vitest";
import {
  apiKeyPermissionsSchema, hasPlatformPermission, parseApiKeyPermissions,
  resolveApiKeyPermissions, standardApiKeyPermissions,
  getExternalOperationPermission, matchExternalOperation, externalOperationAdditionalPermissions,
} from "./platform-permissions";

describe("API key access compatibility", () => {
  it("new Spaces and asset grants are explicit even for legacy administrator keys", () => {
    for (const stored of [[], ["platform:admin"], standardApiKeyPermissions]) {
      expect(resolveApiKeyPermissions(parseApiKeyPermissions(stored)).filter(p => p.startsWith("spaces:") || p.startsWith("assets:"))).toEqual([]);
    }
    expect(hasPlatformPermission(["platform:admin"], "platform:admin")).toBe(true);
    expect(hasPlatformPermission(["access:custom", "spaces:execute"], "spaces:execute")).toBe(true);
    expect(getExternalOperationPermission("GET", "/api/external/spaces/capabilities")).toBe("spaces:read");
    expect(getExternalOperationPermission("PUT", "/api/external/assets/uploads/upload/content")).toBe("assets:upload");
    const operation = matchExternalOperation("POST", "/api/external/spaces/space/copy");
    expect(externalOperationAdditionalPermissions[operation!]).toEqual(["spaces:read"]);
  });
  it.each([
    [[], ["models:read", "generations:create", "generations:read"]],
    [["platform:read"], ["models:read", "generations:create", "generations:read", "history:read", "presets:read", "monitoring:read"]],
    [["platform:write"], ["models:read", "generations:create", "generations:read", "history:read", "presets:read", "monitoring:read", "history:delete", "presets:create", "presets:update", "presets:delete"]],
    [["platform:admin"], ["models:read", "generations:create", "generations:read", "history:read", "presets:read", "monitoring:read", "history:delete", "presets:create", "presets:update", "presets:delete", "models:manage", "monitoring:read-all"]],
  ])("preserves the exact legacy scope %j", (stored, expected) => {
    expect(resolveApiKeyPermissions(parseApiKeyPermissions(stored))).toEqual(expected);
  });
  it("a custom read key cannot generate or delete and admin actions do not imply account actions", () => {
    const read = parseApiKeyPermissions(["access:custom", "history:read", "models:read"]);
    expect(hasPlatformPermission(read, "history:read")).toBe(true);
    expect(hasPlatformPermission(read, "generations:create")).toBe(false);
    expect(hasPlatformPermission(read, "history:delete")).toBe(false);
    expect(resolveApiKeyPermissions(["access:custom", "models:manage"])).toEqual(["models:manage"]);
    expect(hasPlatformPermission(standardApiKeyPermissions, "models:manage")).toBe(false);
    expect(hasPlatformPermission(standardApiKeyPermissions, "monitoring:read-all")).toBe(false);
  });
  it.each([null, ["unknown"], ["access:custom", "platform:admin"], ["history:read"], ["access:custom", "history:read", "history:read"], { admin: true }])("rejects corrupt or ambiguous permissions %j", (stored) => {
    expect(apiKeyPermissionsSchema.safeParse(stored).success).toBe(false);
    expect(resolveApiKeyPermissions(parseApiKeyPermissions(stored))).toEqual([]);
  });
});
