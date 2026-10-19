// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  BodyLimitError,
  HEAVY_BODY_CONCURRENCY,
  inspectMultipartFiles,
  mapWithConcurrency,
  readBoundedBytes,
  readBoundedJsonBody,
  readRouteJsonBody,
  readExternalJsonBody,
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
  it("returns a timeout even when transport cancellation is still pending", async () => {
    vi.useFakeTimers();
    let releaseCancel!: () => void;
    const cancellation = new Promise<void>((resolve) => { releaseCancel = resolve; });
    try {
      const request = new Request("http://localhost/api/test", {
        method: "POST", body: new ReadableStream({ pull() {}, cancel: () => cancellation }), duplex: "half",
      } as RequestInit & { duplex: "half" });
      let code: string | undefined;
      const pending = readBoundedBytes(request, 1024, 5).catch((error: BodyLimitError) => { code = error.code; });
      await vi.advanceTimersByTimeAsync(10);
      expect(code).toBe("BODY_TIMEOUT");
      releaseCancel();
      await pending;
    } finally {
      releaseCancel();
      vi.useRealTimers();
    }
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
  it("reports malformed json separately from oversize", async () => {
    await expect(
      readRouteJsonBody(requestWithBody("{not json"), 1024),
    ).resolves.toEqual({ ok: false, code: "BODY_INVALID", status: 400 });

    await expect(
      readRouteJsonBody(
        requestWithBody("{}", { "content-length": "9999" }),
        1024,
      ),
    ).resolves.toMatchObject({ ok: false, status: 413 });
  });
});

describe("readExternalJsonBody", () => {
  it.each(["text/plain", "application/jsonp", "application/json-invalid", "multipart/form-data"]) (
    "rejects %s without reading the body", async (contentType) => {
      const request = requestWithBody("{}", { "content-type": contentType });
      await expect(readExternalJsonBody(request)).resolves.toEqual({ ok: false, code: "UNSUPPORTED_MEDIA_TYPE", status: 415 });
      expect(request.bodyUsed).toBe(false);
    },
  );
  it("rejects a missing media type while keeping the internal reader compatible", async () => {
    const request = new Request("http://localhost/api/test", { method: "POST", body: new Uint8Array([123, 125]) });
    await expect(readExternalJsonBody(request)).resolves.toMatchObject({ ok: false, status: 415 });
    await expect(readRouteJsonBody(requestWithBody("{}"))).resolves.toEqual({ ok: true, body: {} });
  });
  it("accepts JSON with charset and preserves parse/size errors", async () => {
    const headers = { "content-type": "Application/JSON; charset=utf-8" };
    await expect(readExternalJsonBody(requestWithBody('{"a":1}', headers))).resolves.toEqual({ ok: true, body: { a: 1 } });
    await expect(readExternalJsonBody(requestWithBody("{", headers))).resolves.toMatchObject({ ok: false, status: 400, code: "BODY_INVALID" });
    await expect(readExternalJsonBody(requestWithBody("{}", { ...headers, "content-length": "1025" }), 1024)).resolves.toMatchObject({ ok: false, status: 413 });
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
