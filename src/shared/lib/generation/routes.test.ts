import { describe, it, expect } from "vitest";
import { generationHref, normalizeMediaType } from "./routes";
describe("generation routes", () => {
  it("preserves repeated reference images and reuse input", () => {
    const url = new URL(
      generationHref("image", {
        prompt: "a & b",
        model: "flux",
        initImage: ["https://a/1", "https://a/2"],
        type: "audio",
      }),
      "http://localhost",
    );
    expect(url.pathname).toBe("/generate");
    expect(url.searchParams.get("prompt")).toBe("a & b");
    expect(url.searchParams.getAll("initImage")).toEqual([
      "https://a/1",
      "https://a/2",
    ]);
    expect(url.searchParams.get("type")).toBe("image");
  });
  it("normalizes unknown media", () => {
    expect(normalizeMediaType("bad")).toBe("image");
    expect(normalizeMediaType("audio")).toBe("audio");
  });
});
