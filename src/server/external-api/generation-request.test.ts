// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  readExternalGenerationRequest,
  resolveExternalFiles,
} from "./generation-request";
import { getExternalModelInput } from "./model-input";
import { mappedModel } from "./test-fixtures";
const fields = getExternalModelInput(mappedModel()).files;
function form() {
  const value = new FormData();
  value.set("type", "image");
  value.set("model", "image-private-id");
  value.set("dynamicParams", JSON.stringify({ text: "test" }));
  return value;
}
function request(body: FormData) {
  return new Request("http://localhost/api/external/generations", {
    method: "POST",
    body,
  });
}
describe("multipart dynamic input", () => {
  it("maps single and repeated file parts into the model's declared inputs", async () => {
    const value = form();
    value.set("file:frame", new File(["a"], "a.png", { type: "image/png" }));
    value.append(
      "file:frames",
      new File(["b"], "b.png", { type: "image/png" }),
    );
    value.append(
      "file:frames",
      new File(["c"], "c.png", { type: "image/png" }),
    );
    const parsed = await readExternalGenerationRequest(request(value));
    const result = await resolveExternalFiles(
      parsed.body.dynamicParams,
      parsed.uploads,
      fields,
    );
    expect(result).toEqual({
      text: "test",
      frame: "data:image/png;base64,YQ==",
      frames: ["data:image/png;base64,Yg==", "data:image/png;base64,Yw=="],
    });
    expect(
      getExternalModelInput(mappedModel()).parse(result).dynamicParams,
    ).toEqual(expect.objectContaining(result));
  });
  it("rejects undeclared files, duplicate JSON/file values and repeated single files", async () => {
    const file = new File(["a"], "a.png");
    await expect(
      resolveExternalFiles({}, new Map([["unknown", [file]]]), fields),
    ).rejects.toThrow("INVALID_FILE_INPUT");
    await expect(
      resolveExternalFiles(
        { frame: null },
        new Map([["frame", [file]]]),
        fields,
      ),
    ).rejects.toThrow("INVALID_FILE_INPUT");
    await expect(
      resolveExternalFiles({}, new Map([["frame", [file, file]]]), fields),
    ).rejects.toThrow("INVALID_FILE_INPUT");
  });
  it("enforces the same advertised upload limit before reading files", async () => {
    await expect(
      resolveExternalFiles(
        {},
        new Map([["frame", [new File(["ab"], "a.png")]]]),
        [{ ...fields[0], maxBytes: 1 }],
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("rejects undeclared top-level fields and malformed parameter JSON", async () => {
    const extra = form();
    extra.set("seed", "1");
    await expect(readExternalGenerationRequest(request(extra))).rejects.toThrow(
      "INVALID_FORM_DATA",
    );
    const invalid = form();
    invalid.set("dynamicParams", "{");
    await expect(
      readExternalGenerationRequest(request(invalid)),
    ).rejects.toThrow("INVALID_JSON");
  });
});
