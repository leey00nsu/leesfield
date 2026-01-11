import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/prisma";
import {
  API_KEY_PREFIX,
  generateApiKey,
  issueApiKey,
  listApiKeys,
  revokeApiKey,
} from "@/server/api-key/lib/api-key-service";

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    apiKey: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("api-key-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("발급된 키는 prefix를 포함하고 마스킹/해시를 제공한다", () => {
    const result = generateApiKey();

    expect(result.apiKey.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(result.maskedKey).toContain("...");
    expect(result.keyHash.length).toBeGreaterThan(10);
  });

  it("API 키를 발급하고 레코드를 반환한다", async () => {
    const record = {
      id: "key-id",
      ownerEmail: "admin@example.com",
      label: "Production",
      maskedKey: "lf_live_aaaa...bbbb",
      status: "active",
      lastUsedAt: null,
      createdAt: new Date("2026-01-10T00:00:00Z"),
      revokedAt: null,
    };

    (prisma.apiKey.create as ReturnType<typeof vi.fn>).mockResolvedValue(record);

    const result = await issueApiKey({
      label: "Production",
      ownerEmail: "admin@example.com",
    });

    expect(result.apiKey.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(result.record.label).toBe("Production");
    expect(prisma.apiKey.create).toHaveBeenCalled();
  });

  it("API 키 목록을 조회한다", async () => {
    const record = {
      id: "key-id",
      ownerEmail: "admin@example.com",
      label: "Production",
      maskedKey: "lf_live_aaaa...bbbb",
      status: "active",
      lastUsedAt: null,
      createdAt: new Date("2026-01-10T00:00:00Z"),
      revokedAt: null,
    };

    (prisma.apiKey.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      record,
    ]);

    const result = await listApiKeys("admin@example.com");

    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe("Production");
  });

  it("API 키를 폐기한다", async () => {
    const record = {
      id: "key-id",
      ownerEmail: "admin@example.com",
      label: "Production",
      maskedKey: "lf_live_aaaa...bbbb",
      status: "active",
      lastUsedAt: null,
      createdAt: new Date("2026-01-10T00:00:00Z"),
      revokedAt: null,
    };

    const revoked = {
      ...record,
      status: "revoked",
      revokedAt: new Date("2026-01-11T00:00:00Z"),
    };

    (prisma.apiKey.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(record);
    (prisma.apiKey.update as ReturnType<typeof vi.fn>).mockResolvedValue(revoked);

    const result = await revokeApiKey({
      id: "key-id",
      ownerEmail: "admin@example.com",
    });

    expect(result.status).toBe("revoked");
    expect(prisma.apiKey.update).toHaveBeenCalled();
  });
});
