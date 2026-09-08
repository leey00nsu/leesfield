import { describe, expect, it } from "vitest";
import {
  buildCurlSnippet,
  buildJavascriptSnippet,
} from "@/features/api-docs/model/snippet-templates";

describe("snippet-templates", () => {
  it("multipart 요청은 파일 필드를 form-data로 렌더링한다", () => {
    const snippet = buildCurlSnippet({
      baseUrl: "https://api.example.com",
      path: "/api/external/generations",
      method: "POST",
      contentType: "multipart/form-data",
      fileFields: ["file:initImages"],
      body: {
        type: "image",
        model: "selected-id",
        dynamicParams: { prompt: "test" },
        "file:initImages": ["sample.png"],
      },
    });

    expect(snippet).toContain('-F "file:initImages=@sample.png"');
    expect(snippet).toContain('-H "X-API-Key: YOUR_API_KEY"');
    expect(snippet).not.toContain("Content-Type");
  });

  it("JSON 요청은 Content-Type 헤더와 body를 포함한다", () => {
    const snippet = buildJavascriptSnippet({
      baseUrl: "https://api.example.com",
      path: "/api/external/generations",
      method: "POST",
      body: {
        type: "image",
        model: "selected-id",
        dynamicParams: { prompt: "hello" },
      },
    });

    expect(snippet).toContain('"Content-Type": "application/json"');
    expect(snippet).toContain("JSON.stringify");
    expect(snippet).toContain('"prompt": "hello"');
  });

  it("audio multipart 요청은 reference audio와 reference text를 함께 렌더링한다", () => {
    const snippet = buildCurlSnippet({
      baseUrl: "https://api.example.com",
      path: "/api/external/generations",
      method: "POST",
      contentType: "multipart/form-data",
      fileFields: ["file:inputAudio"],
      body: {
        type: "audio",
        model: "selected-id",
        dynamicParams: { prompt: "hello", referenceText: "reference words" },
        "file:inputAudio": "sample.wav",
      },
    });

    expect(snippet).toContain('-F "file:inputAudio=@sample.wav"');
    expect(snippet).toContain("reference words");
  });
});
