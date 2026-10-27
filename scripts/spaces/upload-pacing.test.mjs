// @vitest-environment node
import { expect, test } from "vitest";
import { createUploadPacer } from "./upload-pacing.mjs";

test("admits the fresh two-request burst and reserves later requests without exceeding refill", () => {
  let now = 1000;
  const reserve = createUploadPacer(() => now);
  expect([reserve(), reserve(), reserve(), reserve()]).toEqual([0, 0, 6100, 12200]);
  // Refill after both previously reserved future requests, not from t=0.
  now += 30000;
  expect([reserve(), reserve()]).toEqual([0, 0]);
  now += 3050;
  expect(reserve()).toBe(3050);
  expect(createUploadPacer(() => now)()).toBe(0);
});
