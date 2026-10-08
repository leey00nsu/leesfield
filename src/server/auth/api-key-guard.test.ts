// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindUnique = vi.hoisted(() => vi.fn());
const mockUpdateMany = vi.hoisted(() => vi.fn());

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    apiKey: {
      findUnique: mockFindUnique,
      updateMany: mockUpdateMany,
    },
  },
}));

import {
  API_KEY_LAST_USED_WRITE_INTERVAL_MS,
  requireApiKey,
  touchApiKeyLastUsedAt,
} from "./api-key-guard";
import { hashApiKey } from "@/server/api-key/lib/api-key-service";

const activeRecord = {
  id: "key-1",
  ownerEmail: "owner@example.com",
  status: "active",
};

describe("API key guard", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdateMany.mockReset();
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  it.each(["Bearer lf_live_bearer", "bearer lf_live_bearer", "Bearer   lf_live_bearer"])(
    "authenticates a single Bearer token: %s", async (authorization) => {
      mockFindUnique.mockResolvedValue(activeRecord);
      expect(await requireApiKey(new Request("http://localhost/api", {
        headers: { Authorization: authorization },
      }))).toEqual({ apiKeyId: "key-1", ownerEmail: "owner@example.com", permissions: [] });
      expect(mockFindUnique).toHaveBeenCalledWith({ where: { keyHash: hashApiKey("lf_live_bearer") } });
    },
  );

  it.each(["", "Basic lf_live_bearer", "Bearer", "Bearer key extra", "Bearer key\textra"])(
    "rejects missing or malformed credentials before looking up a key: %s", async (authorization) => {
      const response = await requireApiKey(new Request("http://localhost/api", { headers: { Authorization: authorization } }));
      expect((response as Response).status).toBe(401);
      expect(mockFindUnique).not.toHaveBeenCalled();
    },
  );

  it("uses an explicit X-API-Key in preference to Bearer", async () => {
    mockFindUnique.mockResolvedValue(activeRecord);
    await requireApiKey(new Request("http://localhost/api", {
      headers: { "X-API-Key": "lf_live_header", Authorization: "Bearer lf_live_bearer" },
    }));
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { keyHash: hashApiKey("lf_live_header") } });
  });

  it.each(["", "lf_live_invalid"])("never falls back from an explicit invalid key: %s", async (key) => {
    mockFindUnique.mockResolvedValue(null);
    const response = await requireApiKey(new Request("http://localhost/api", {
      headers: { "X-API-Key": key, Authorization: "Bearer lf_live_bearer" },
    }));
    expect((response as Response).status).toBe(key ? 403 : 401);
    expect(mockFindUnique.mock.calls).toHaveLength(key ? 1 : 0);
  });

  it("rejects a revoked Bearer key without touching telemetry", async () => {
    mockFindUnique.mockResolvedValue({ ...activeRecord, status: "revoked" });
    const response = await requireApiKey(new Request("http://localhost/api", {
      headers: { Authorization: "Bearer lf_live_revoked" },
    }));
    expect((response as Response).status).toBe(403);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("uses a conditional active-row update for usage telemetry", async () => {
    const now = new Date("2026-09-16T12:00:00.000Z");

    await touchApiKeyLastUsedAt("key-1", now);

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "key-1",
        status: "active",
        OR: [
          { lastUsedAt: null },
          {
            lastUsedAt: {
              lt: new Date(
                now.getTime() - API_KEY_LAST_USED_WRITE_INTERVAL_MS,
              ),
            },
          },
        ],
      },
      data: { lastUsedAt: now },
    });
  });

  it("keeps revocation authoritative and does not touch a revoked key", async () => {
    mockFindUnique.mockResolvedValue({
      ...activeRecord,
      status: "revoked",
    });

    const response = await requireApiKey(
      new Request("http://localhost/api", {
        headers: { "x-api-key": "lf_live_invalid" },
      }),
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(403);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("does not fail an authenticated request when telemetry update fails", async () => {
    mockFindUnique.mockResolvedValue(activeRecord);
    mockUpdateMany.mockRejectedValue(new Error("database unavailable"));

    const result = await requireApiKey(
      new Request("http://localhost/api", {
        headers: { "x-api-key": "lf_live_valid" },
      }),
    );
    await Promise.resolve();

    expect(result).toEqual({
      apiKeyId: "key-1",
      ownerEmail: "owner@example.com",
      permissions: [],
    });
  });
});
