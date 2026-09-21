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
    });
  });
});
