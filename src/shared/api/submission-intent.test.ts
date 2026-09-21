import { describe, expect, it } from "vitest";

import { createSubmissionIntent } from "./submission-intent";

describe("createSubmissionIntent", () => {
  it("reuses a key only for retries of the same payload", () => {
    const intent = createSubmissionIntent();
    const first = intent.take("payload-a");
    intent.settle(first, new Error("transport"));

    expect(intent.take("payload-a")).toBe(first);
    expect(intent.take("payload-b")).not.toBe(first);
  });

  it("does not let an older concurrent request settle a newer intent", () => {
    const intent = createSubmissionIntent();
    const first = intent.take("payload-a");
    const second = intent.take("payload-b");

    intent.settle(first);
    expect(intent.take("payload-b")).toBe(second);
  });

  it("ends a rejected request intent", () => {
    const intent = createSubmissionIntent();
    const first = intent.take("payload-a");
    intent.settle(first, { status: 409 });

    expect(intent.take("payload-a")).not.toBe(first);
  });
});
