// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  decodeBase64DataUrl,
  limitReadableStream,
  readFetchResponseBytes,
} from "./bounded-io";

describe("bounded outbound I/O", () => {
  it("stops buffered responses at the declared byte budget", async () => {
    await expect(
      readFetchResponseBytes(new Response(new Uint8Array([1, 2, 3])), 2),
    ).rejects.toMatchObject({
      code: "IO_RESPONSE_TOO_LARGE",
    });
  });

  it("stops streamed responses when a chunk crosses the byte budget", async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3]));
        controller.close();
      },
    });

    await expect(
      new Response(limitReadableStream(source, { maxBytes: 2 })).arrayBuffer(),
    ).rejects.toMatchObject({
      code: "IO_RESPONSE_TOO_LARGE",
    });
  });

  it("enforces media data URL limits before a storage upload", () => {
    expect(
      decodeBase64DataUrl("data:image/png;base64,AQID", {
        maxBytes: 3,
        invalidCode: "INVALID",
      }),
    ).toMatchObject({ contentType: "image/png", buffer: Buffer.from([1, 2, 3]) });

    expect(() =>
      decodeBase64DataUrl("data:image/png;base64,AQID", {
        maxBytes: 2,
        invalidCode: "INVALID",
        tooLargeCode: "TOO_LARGE",
      }),
    ).toThrow("TOO_LARGE");
  });
});
