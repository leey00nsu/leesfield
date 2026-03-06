import { describe, expect, it } from "vitest";
import type { RequestBodyObject, SchemaObject } from "openapi3-ts/oas31";
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

  it("audio generation 요청 스키마에 reference audio/reference text를 노출한다", () => {
    const document = getOpenApiDocument();
    const requestBody = document.paths["/api/external/audio-generation"]?.post
      ?.requestBody as RequestBodyObject | undefined;
    const schema =
      requestBody?.content?.["multipart/form-data"]?.schema as
        | SchemaObject
        | undefined;

    expect(schema?.properties?.inputAudio).toMatchObject({
      type: "string",
      format: "binary",
    });
    expect(schema?.properties?.referenceText).toMatchObject({
      type: "string",
    });
  });
});
