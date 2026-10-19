import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  buildCurlSnippet,
  buildJavascriptSnippet,
  buildPythonSnippet,
  buildGenerationMultipartSnippet,
} from "@/features/api-docs/model/snippet-templates";
import { spacesWorkflowExample } from "./spaces-workflow-example";
import { mediaSelectionExample } from "./media-selection-example";

describe("snippet-templates", () => {
  it("generates raw binary transfer examples and a syntactically valid explicit node chain", () => {
    const input = { baseUrl: "https://api.example.com", path: "/api/external/assets/uploads/u/content?target=issued", method: "PUT", contentType: "application/octet-stream", body: "sample" };
    expect(buildCurlSnippet(input)).toContain("--data-binary @./input.bin");
    expect(buildJavascriptSnippet(input)).toContain('body: await readFile("./input.bin")');
    expect(buildPythonSnippet(input)).toContain("data=source");
    for (const build of [buildCurlSnippet, buildJavascriptSnippet, buildPythonSnippet]) expect(build(input)).not.toContain("JSON.stringify");
    execFileSync(process.execPath, ["--check", "--input-type=module"], { input: spacesWorkflowExample });
    execFileSync(process.execPath, ["--check", "--input-type=module"], { input: mediaSelectionExample });
    expect(spacesWorkflowExample).toContain('await run("next")');
  });
  it.each([buildCurlSnippet, buildJavascriptSnippet, buildPythonSnippet])("keeps retries optional in default generation examples", (build) => {
    const context = { baseUrl: "https://api.example.com", path: "/api/external/generations", method: "POST", body: { type: "image", model: "selected-id", dynamicParams: {} } };
    expect(build(context)).not.toContain("Idempotency-Key");
    expect(build({ ...context, headers: { "Idempotency-Key": "same-intent" } })).toContain("Idempotency-Key");
  });
  it("supports revision deletion bodies and empty 204 responses", () => {
    const context = { baseUrl: "https://api.example.com", path: "/api/external/prompt-presets/example", method: "DELETE", body: { expectedRevision: 2 } };
    for (const build of [buildCurlSnippet, buildJavascriptSnippet, buildPythonSnippet])
      expect(build(context)).toContain('"expectedRevision": 2');
    expect(buildJavascriptSnippet(context)).toContain("response.status === 204 ? null");
    expect(buildPythonSnippet(context)).toContain("None if response.status_code == 204");
  });
  it.each([buildCurlSnippet, buildJavascriptSnippet, buildPythonSnippet])("preserves explicit Bearer credentials without adding a competing key", (build) => {
    const snippet = build({ baseUrl: "https://api.example.com", path: "/api/external/models", method: "GET", headers: { authorization: "Bearer chosen-key" } });
    expect(snippet).toContain("Bearer chosen-key");
    expect(snippet).not.toContain("X-API-Key");
    expect(snippet).not.toContain("YOUR_API_KEY");
  });
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

    expect(snippet).toContain("-F 'file:initImages=@sample.png'");
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

    expect(snippet).toContain("-F 'file:inputAudio=@sample.wav'");
    expect(snippet).toContain("reference words");
  });
  it("multipart curl preserves JSON and repeated file arguments through the shell", () => {
    const prompt = "A \"quote\", an 'apostrophe' and $(printf unexpected)";
    const snippet = buildGenerationMultipartSnippet("https://api.example.com", prompt);
    const args = execFileSync("/bin/sh", ["-c", "curl() { printf '%s\\0' \"$@\"; };\n" + snippet],
      { encoding: "utf8" }).split("\0").filter(Boolean);
    const fields = args.flatMap((arg, index) => ["--form-string", "-F"].includes(arg) ? [args[index + 1]] : []);
    expect(fields).toEqual(expect.arrayContaining([
      "type=image", "model=<MODEL_ID>", "file:<INPUT_NAME>=@reference-1.png", "file:<INPUT_NAME>=@reference-2.png",
    ]));
    const dynamicParams = fields.find((field) => field.startsWith("dynamicParams="))!;
    expect(JSON.parse(dynamicParams.slice("dynamicParams=".length))).toEqual({ prompt });
    expect(args).not.toContain("Content-Type: multipart/form-data");
  });
});
