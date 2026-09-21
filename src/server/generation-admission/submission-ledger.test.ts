import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/runtime/env", () => ({
  getServerEnv: () => ({ sessionPassword: "pepper-value" }),
}));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));

import {
  canonicalJson,
  hashIdempotencyKey,
  hashSubmissionPayload,
  submissionScope,
} from "./submission-ledger";

describe("canonicalJson", () => {
  it("sorts object keys and omits undefined values", () => {
    expect(canonicalJson({ b: 1, a: { d: 4, c: [3, undefined, 2] } })).toBe(
      '{"a":{"c":[3,null,2],"d":4},"b":1}',
    );
  });

  it("keeps array order, which is semantically meaningful", () => {
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]));
  });
});

describe("hashSubmissionPayload", () => {
  it("is stable for equivalent inputs regardless of key order", () => {
    const left = hashSubmissionPayload({ prompt: "a", steps: 20, seed: 1 });
    const right = hashSubmissionPayload({ seed: 1, steps: 20, prompt: "a" });
    expect(left).toBe(right);
    expect(left).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when a value changes", () => {
    expect(hashSubmissionPayload({ steps: 20 })).not.toBe(
      hashSubmissionPayload({ steps: 21 }),
    );
  });
});

describe("submissionScope", () => {
  it("separates API key callers from the session owner", () => {
    expect(submissionScope("owner@example.com", "key-1")).toBe("key:key-1");
    expect(submissionScope("owner@example.com", null)).toBe(
      "session:owner@example.com",
    );
  });
});

describe("hashIdempotencyKey", () => {
  it("scopes the key and never stores the raw value", () => {
    const hashed = hashIdempotencyKey("key:key-1", "retry-token");
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed).not.toContain("retry-token");
    expect(hashIdempotencyKey("key:key-2", "retry-token")).not.toBe(hashed);
    expect(hashIdempotencyKey("key:key-1", "other-token")).not.toBe(hashed);
  });
});

