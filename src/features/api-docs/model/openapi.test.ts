import { describe, expect, it } from "vitest";
import { getOpenApiDocument } from "@/features/api-docs/model/openapi";

describe("getOpenApiDocument", () => {
  it("audio generation 외부 API 경로와 태그를 포함한다", () => {
    const document = getOpenApiDocument();

    expect(document.tags?.some((tag) => tag.name === "Audio")).toBe(true);
    expect(document.paths["/api/external/audio-generation"]?.post).toBeTruthy();
    expect(
      document.paths["/api/external/audio-generation/{requestId}"]?.get,
    ).toBeTruthy();
  });
});
