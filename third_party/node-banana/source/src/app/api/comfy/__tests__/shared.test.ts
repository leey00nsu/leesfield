/**
 * Getting media out of a data URL, and naming it for the engine.
 *
 * The failure this pins down: a data URL is allowed parameters between its
 * media type and the `;base64` marker, and a pattern that expected the marker
 * to follow the type directly matched no such URL at all. `decodeDataUrl` then
 * returned null and the run route blamed the user's input — "could not read the
 * media connected to …" — for a perfectly valid one.
 */

import { describe, it, expect } from "vitest";

import { decodeDataUrl, uploadFilename } from "../shared";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("decodeDataUrl", () => {
  it("reads the ordinary base64 form", () => {
    const decoded = decodeDataUrl(`data:image/png;base64,${Buffer.from("PNG").toString("base64")}`);

    expect(decoded?.contentType).toBe("image/png");
    expect(text(decoded!.bytes)).toBe("PNG");
  });

  it("reads one that carries a media-type parameter", () => {
    const decoded = decodeDataUrl(
      `data:text/plain;charset=utf-8;base64,${Buffer.from("hello").toString("base64")}`
    );

    // The parameter is not part of the type the engine is told about.
    expect(decoded?.contentType).toBe("text/plain");
    expect(text(decoded!.bytes)).toBe("hello");
  });

  it("reads a percent-encoded payload with no base64 marker", () => {
    const decoded = decodeDataUrl("data:text/plain;charset=utf-8,hello%20there");

    expect(decoded?.contentType).toBe("text/plain");
    expect(text(decoded!.bytes)).toBe("hello there");
  });

  it("falls back to a generic type when none is given", () => {
    const decoded = decodeDataUrl(`data:;base64,${Buffer.from("x").toString("base64")}`);

    expect(decoded?.contentType).toBe("application/octet-stream");
  });

  it("returns nothing for what is not a data URL at all", () => {
    expect(decodeDataUrl("https://example.com/cat.png")).toBeNull();
    expect(decodeDataUrl("blob:http://localhost/abc")).toBeNull();
    expect(decodeDataUrl("data:image/png;base64,")).toBeNull();
  });
});

describe("uploadFilename", () => {
  const bytes = new Uint8Array([1, 2, 3]);

  it("names the file after the input, the content and its type", () => {
    const name = uploadFilename("product", "image/png", bytes);

    expect(name).toMatch(/^node-banana-product-[0-9a-f]{16}\.png$/);
  });

  it("gives the same bytes the same name, and different bytes a different one", () => {
    // Content-addressed on purpose: the legacy upload overwrites by filename,
    // so two concurrent runs sharing an input name would clobber each other.
    expect(uploadFilename("in", "image/png", bytes)).toBe(uploadFilename("in", "image/png", bytes));
    expect(uploadFilename("in", "image/png", bytes)).not.toBe(
      uploadFilename("in", "image/png", new Uint8Array([9]))
    );
  });

  it("keeps the suffix to the shape of an extension", () => {
    // It reaches the engine as a filename, so an unbounded or oddly-shaped
    // subtype is not worth passing through.
    expect(uploadFilename("in", "image/svg+xml", bytes).endsWith(".svg")).toBe(true);
    expect(uploadFilename("in", "application/x-a-very-long-subtype", bytes).endsWith(".bin")).toBe(
      true
    );
    expect(uploadFilename("in", "application/vnd.foo bar", bytes).endsWith(".bin")).toBe(true);
    expect(uploadFilename("in", "notatype", bytes).endsWith(".bin")).toBe(true);
  });
});
