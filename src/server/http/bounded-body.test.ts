// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  BodyLimitError,
  HEAVY_BODY_CONCURRENCY,
  inspectMultipartFiles,
  mapWithConcurrency,
  readBoundedBytes,
  readBoundedJsonBody,
  readRouteJsonBody,
  resetHeavyBodyGaugeForTests,
  withHeavyBodyPermit,
} from "./bounded-body";

function requestWithBody(
  body: string | Buffer | null,
  headers: Record<string, string> = {},
): Request {
  const payload: BodyInit | undefined =
    body === null
      ? undefined
      : typeof body === "string"
        ? body
        : (new Uint8Array(body).buffer as ArrayBuffer);
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers,
    body: payload,
  });
}

function chunkedRequest(chunks: string[], maxTotal?: number): Request {
  const encoder = new TextEncoder();
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (chunks.length === 0) {
        controller.close();
        return;
      }
      const next = chunks.shift() as string;
      sent += next.length;
      if (maxTotal !== undefined && sent > maxTotal) {
        controller.error(new Error("client stopped"));
        return;
      }
      controller.enqueue(encoder.encode(next));
    },
  });
  return new Request("http://localhost/api/test", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("readBoundedBytes", () => {
  it("rejects a declared length above the budget before reading", async () => {
    await expect(
      readBoundedBytes(requestWithBody("small", { "content-length": "2048" }), 1024),
    ).rejects.toMatchObject({ code: "BODY_TOO_LARGE", status: 413 });
  });

  it("stops a chunked body that exceeds the budget", async () => {
    const request = chunkedRequest(["x".repeat(700), "y".repeat(700)]);
    await expect(readBoundedBytes(request, 1024)).rejects.toMatchObject({
      code: "BODY_TOO_LARGE",
    });
  });

  it("returns the bytes inside the budget", async () => {
    const request = requestWithBody("hello");
    await expect(readBoundedBytes(request, 1024)).resolves.toEqual(
      Buffer.from("hello"),
    );
  });

  it("times out a body that never produces another chunk", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({ pull() {} }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    await expect(readBoundedBytes(request, 1024, 5)).rejects.toMatchObject({
      code: "BODY_TIMEOUT",
      status: 408,
    });
  });

  it("stops reading when the caller aborts", async () => {
    const controller = new AbortController();
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({ pull() {} }),
      duplex: "half",
      signal: controller.signal,
    } as RequestInit & { duplex: "half" });
    const pending = readBoundedBytes(request, 1024, 1_000);
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      code: "BODY_ABORTED",
      status: 499,
    });
  });
});

describe("readBoundedJsonBody", () => {
  it("parses valid json and reports invalid json separately", async () => {
    await expect(
      readBoundedJsonBody(requestWithBody(JSON.stringify({ a: 1 })), 1024),
    ).resolves.toEqual({ a: 1 });

    await expect(
      readBoundedJsonBody(requestWithBody("{not json"), 1024),
    ).rejects.toMatchObject({ code: "BODY_INVALID", status: 400 });
  });
});

describe("readRouteJsonBody", () => {
  it("keeps the null-body contract for malformed json but blocks oversize", async () => {
    await expect(
      readRouteJsonBody(requestWithBody("{not json"), 1024),
    ).resolves.toEqual({ ok: true, body: null });

    await expect(
      readRouteJsonBody(
        requestWithBody("{}", { "content-length": "9999" }),
        1024,
      ),
    ).resolves.toMatchObject({ ok: false, status: 413 });
  });
});

describe("inspectMultipartFiles", () => {
  function formWithFiles(count: number, size: number): FormData {
    const form = new FormData();
    for (let index = 0; index < count; index += 1) {
      form.append(
        "file:" + String(index),
        new File([new Uint8Array(size)], "file-" + String(index) + ".png"),
      );
    }
    return form;
  }

  it("counts files, per-file size and the total", () => {
    expect(
      inspectMultipartFiles(formWithFiles(2, 10), {
        maxFiles: 4,
        maxFileBytes: 100,
        maxTotalFileBytes: 1000,
      }),
    ).toHaveLength(2);

    expect(() =>
      inspectMultipartFiles(formWithFiles(5, 10), { maxFiles: 4 }),
    ).toThrowError(
      expect.objectContaining({ code: "BODY_TOO_LARGE", message: "TOO_MANY_FILES" }),
    );

    expect(() =>
      inspectMultipartFiles(formWithFiles(1, 500), { maxFileBytes: 100 }),
    ).toThrowError(expect.objectContaining({ message: "FILE_TOO_LARGE" }));

    expect(() =>
      inspectMultipartFiles(formWithFiles(4, 100), {
        maxFiles: 8,
        maxFileBytes: 1000,
        maxTotalFileBytes: 150,
      }),
    ).toThrowError(expect.objectContaining({ message: "FILES_TOO_LARGE" }));
  });

  it("rejects an empty file part", () => {
    const form = new FormData();
    form.append("file:a", new File([new Uint8Array(0)], "empty.png"));
    expect(() => inspectMultipartFiles(form)).toThrowError(
      expect.objectContaining({ message: "INVALID_FILE" }),
    );
  });
});

describe("withHeavyBodyPermit", () => {
  it("rejects a burst beyond the process budget", async () => {
    resetHeavyBodyGaugeForTests();
    const releases: Array<() => void> = [];
    const held = Array.from({ length: HEAVY_BODY_CONCURRENCY }, () =>
      withHeavyBodyPermit(
        () => new Promise<void>((resolve) => releases.push(resolve)),
      ),
    );

    await expect(withHeavyBodyPermit(async () => undefined)).rejects.toBeInstanceOf(
      BodyLimitError,
    );

    releases.forEach((release) => release());
    await Promise.all(held);
    resetHeavyBodyGaugeForTests();
  });
});

describe("mapWithConcurrency", () => {
  it("keeps in-flight work inside the limit and preserves order", async () => {
    let inFlight = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return value * 2;
    });

    expect(result).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});
