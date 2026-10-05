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


it("preserves independent repeat idempotency keys and identical payloads on the real image API client", async () => {
  const {requestImageGeneration}=await import("@/features/image-generation/api/image-generation-api");
  const {imageGenerationDefaults}=await import("@/features/image-generation/model/image-generation-schema");
  const original=globalThis.fetch;
  const calls:RequestInit[]=[];
  globalThis.fetch=async(_input,init)=>{calls.push(init!);return new Response(JSON.stringify({requestId:"id",status:"pending",progress:0}));};
  try {
    const payload={...imageGenerationDefaults,prompt:"same conditions"};
    for(const idempotencyKey of ["run-one","run-two"])await requestImageGeneration(payload,{idempotencyKey,signal:new AbortController().signal});
    expect(calls.map(c=>(c.headers as Record<string,string>)["Idempotency-Key"])).toEqual(["run-one","run-two"]);
    expect(calls.map(c=>JSON.parse(c.body as string))).toEqual([payload,payload]);
  } finally {globalThis.fetch=original;}
});
