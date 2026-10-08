// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildQueueFullResponse } from "./response";

describe("queue capacity response", () => {
  it.each(["OWNER_LIMIT", "PROVIDER_LIMIT", "GLOBAL_LIMIT"] as const)(
    "preserves the admission reason and retry hint for %s", async (reason) => {
      const response = buildQueueFullResponse(reason);
      expect(response.status).toBe(reason === "GLOBAL_LIMIT" ? 503 : 429);
      expect(response.headers.get("Retry-After")).toBe("30");
      expect(await response.json()).toEqual({ message: "GENERATION_QUEUE_FULL", reason });
    },
  );
});
