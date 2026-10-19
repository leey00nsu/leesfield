import { z } from "zod";

export const apiOperationPermissions = [
  "models:read", "generations:create", "generations:read",
  "history:read", "history:delete",
  "presets:read", "presets:create", "presets:update", "presets:delete",
  "monitoring:read", "models:manage", "monitoring:read-all",
  "spaces:read", "spaces:create", "spaces:update", "spaces:delete", "spaces:execute",
  "assets:read", "assets:upload",
] as const;
export type ApiOperationPermission = (typeof apiOperationPermissions)[number];
const legacyPermissions = ["platform:read", "platform:write", "platform:admin"] as const;
export const customAccessMarker = "access:custom" as const;
export const platformPermissionSchema = z.enum([
  ...legacyPermissions, customAccessMarker, ...apiOperationPermissions,
]);
export type PlatformPermission = z.infer<typeof platformPermissionSchema>;
export const standardApiKeyPermissions: PlatformPermission[] = [
  customAccessMarker, ...apiOperationPermissions.filter((permission) =>
    permission !== "models:manage" && permission !== "monitoring:read-all" &&
    !permission.startsWith("spaces:") && !permission.startsWith("assets:")),
];
export const apiKeyPermissionsSchema = z.array(platformPermissionSchema)
  .max(apiOperationPermissions.length + 1)
  .refine((permissions) => new Set(permissions).size === permissions.length)
  .refine((permissions) => {
    const custom = permissions.includes(customAccessMarker);
    return custom
      ? !permissions.some((permission) => legacyPermissions.includes(permission as typeof legacyPermissions[number]))
      : permissions.every((permission) => legacyPermissions.includes(permission as typeof legacyPermissions[number]));
  });

/** Corrupt storage must not turn a restricted key into a legacy generation key. */
export function parseApiKeyPermissions(value: unknown): PlatformPermission[] {
  const parsed = apiKeyPermissionsSchema.safeParse(value === undefined ? [] : value);
  return parsed.success ? parsed.data : [customAccessMarker];
}

export function resolveApiKeyPermissions(
  permissions: readonly PlatformPermission[] | undefined,
): ApiOperationPermission[] {
  const granted = parseApiKeyPermissions(permissions ? [...permissions] : []);
  if (granted.includes(customAccessMarker))
    return granted.filter((permission): permission is ApiOperationPermission =>
      apiOperationPermissions.includes(permission as ApiOperationPermission));
  const effective: ApiOperationPermission[] = ["models:read", "generations:create", "generations:read"];
  if (granted.length) effective.push("history:read", "presets:read", "monitoring:read");
  if (granted.includes("platform:write") || granted.includes("platform:admin"))
    effective.push("history:delete", "presets:create", "presets:update", "presets:delete");
  if (granted.includes("platform:admin")) effective.push("models:manage", "monitoring:read-all");
  return effective;
}

export function hasPlatformPermission(
  permissions: readonly PlatformPermission[] | undefined,
  required: PlatformPermission,
): boolean {
  const effective = resolveApiKeyPermissions(permissions);
  if (required === customAccessMarker) return false;
  if (required === "platform:read") return ["history:read", "presets:read", "monitoring:read"].every((p) => effective.includes(p as ApiOperationPermission));
  if (required === "platform:write") return standardApiKeyPermissions.slice(1).every((p) => effective.includes(p as ApiOperationPermission));
  if (required === "platform:admin") return apiOperationPermissions.filter(p => !p.startsWith("spaces:") && !p.startsWith("assets:")).every((p) => effective.includes(p));
  return effective.includes(required);
}

/** Shared by HTTP authorization and the public specification. */
export const externalOperationPermissions: Record<string, ApiOperationPermission> = {
  "GET /api/external/spaces": "spaces:read",
  "POST /api/external/spaces": "spaces:create",
  "GET /api/external/spaces/capabilities": "spaces:read",
  "GET /api/external/spaces/models": "spaces:read",
  "GET /api/external/spaces/models/{modelId}/schema": "spaces:read",
  "GET /api/external/spaces/{spaceId}": "spaces:read",
  "PUT /api/external/spaces/{spaceId}": "spaces:update",
  "DELETE /api/external/spaces/{spaceId}": "spaces:delete",
  "POST /api/external/spaces/{spaceId}/copy": "spaces:create",
  "GET /api/external/spaces/{spaceId}/nodes/{nodeId}/executions": "spaces:read",
  "POST /api/external/spaces/{spaceId}/nodes/{nodeId}/executions": "spaces:execute",
  "GET /api/external/spaces/{spaceId}/nodes/{nodeId}/executions/{executionId}": "spaces:read",
  "DELETE /api/external/spaces/{spaceId}/nodes/{nodeId}/executions/{executionId}": "spaces:execute",
  "PATCH /api/external/spaces/{spaceId}/nodes/{nodeId}/executions/{executionId}": "spaces:update",
  "GET /api/external/spaces/{spaceId}/nodes/{nodeId}/output": "spaces:read",
  "GET /api/external/assets": "assets:read",
  "GET /api/external/assets/{assetId}": "assets:read",
  "POST /api/external/assets/uploads": "assets:upload",
  "PUT /api/external/assets/uploads/{uploadId}/content": "assets:upload",
  "POST /api/external/assets/uploads/{uploadId}/confirm": "assets:upload",
  "POST /api/external/generations": "generations:create",
  "GET /api/external/generations/{requestId}": "generations:read",
  "GET /api/external/models": "models:read",
  "GET /api/external/models/{modelId}/schema": "models:read",
  "GET /api/external/history": "history:read",
  "GET /api/external/history/status": "history:read",
  "GET /api/external/history/{historyId}": "history:read",
  "DELETE /api/external/history/{historyId}": "history:delete",
  "GET /api/external/prompt-presets": "presets:read",
  "GET /api/external/prompt-presets/{key}": "presets:read",
  "POST /api/external/prompt-presets": "presets:create",
  "PATCH /api/external/prompt-presets/{key}": "presets:update",
  "DELETE /api/external/prompt-presets/{key}": "presets:delete",
  "POST /api/external/prompt-presets/{key}/restore": "presets:update",
  ...Object.fromEntries(["overview", "stats", "requests", "requests/detail", "top", "api-keys"].map((path) =>
    ["GET /api/external/monitoring/" + path, "monitoring:read" as const])),
  ...Object.fromEntries(["GET", "POST"].map((method) => [method + " /api/external/admin/models", "models:manage" as const])),
  ...Object.fromEntries(["PATCH", "DELETE"].map((method) => [method + " /api/external/admin/models/{modelKey}", "models:manage" as const])),
  "POST /api/external/admin/models/import": "models:manage",
  "GET /api/external/admin/models/modal-comfyui": "models:manage",
  "POST /api/external/admin/models/modal-comfyui": "models:manage",
};

/** Additional conditions are shared by authorization and public documentation. */
export const externalOperationAdditionalPermissions: Record<string, ApiOperationPermission[]> = {
  "POST /api/external/spaces/{spaceId}/copy": ["spaces:read"],
};

export function matchExternalOperation(method: string, pathname: string) {
  const verb = method.toUpperCase();
  const exact = verb + " " + pathname;
  if (externalOperationPermissions[exact]) return exact;
  return Object.keys(externalOperationPermissions).find((key) => {
    const [operationMethod, path] = key.split(" ");
    return operationMethod === verb && new RegExp("^" + path.replace(/\{[^}]+\}/g, "[^/]+") + "$").test(pathname);
  });
}

export function getExternalOperationPermission(method: string, pathname: string) {
  const operation = matchExternalOperation(method, pathname);
  return operation ? externalOperationPermissions[operation] : undefined;
}
