import { describe, expect, it } from "vitest";

import { RATE_LIMITS } from "./policies";

describe("rate limit policy bursts", () => {
  it("matches the documented immediate burst capacities", () => {
    expect(RATE_LIMITS.generationOwner.capacity).toBe(3);
    expect(RATE_LIMITS.generationKey.capacity).toBe(3);
    expect(RATE_LIMITS.uploadOwner.capacity).toBe(2);
    expect(RATE_LIMITS.statsOwner.capacity).toBe(5);
    expect(RATE_LIMITS.readOwner.capacity).toBe(30);
  });
});
