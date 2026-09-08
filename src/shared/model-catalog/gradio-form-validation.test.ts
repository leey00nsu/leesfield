
import { describe, expect, it } from "vitest";
import { gradioFormError, gradioFormMessage } from "./gradio-form-validation";
import type { GradioContract } from "./gradio-contract";
const contract: GradioContract = {
 version: 1, apiName: "/generate", reviewed: false, diagnostics: [],
 output: {media: "video", path: [0], multiple: false},
 inputs: [
  {name: "in_0", label: "Prompt", schema: {type: "string"}, kind: "string", canonical: "prompt", required: true, nullable: false},
  {name: "in_1", label: "First Frame (optional)", schema: {}, kind: "file", required: true, nullable: false},
  {name: "count", label: "Count", schema: {type: "number"}, kind: "number", required: true, nullable: false, min: 0},
  {name: "flag", label: "Flag", schema: {type: "boolean"}, kind: "boolean", required: true, nullable: false},
 ],
};
describe("generation readiness", () => {
 it("requires a frame and accepts zero and false without a review gate", () => {
  const values={prompt: "hello", dynamicParams: {count: 0, flag: false}};
  const error=gradioFormError(contract,values)!;
  expect(error).toBe("HF_CONTRACT_REQUIRED:in_1");
  expect(gradioFormMessage(error,contract,"ko")).toBe("First Frame: 필수 입력입니다.");
  expect(gradioFormMessage(error,contract,"en")).toBe("First Frame: This field is required.");
  expect(gradioFormError(contract,{...values,dynamicParams:{...values.dynamicParams,in_1:"https://example.com/frame.png"}})).toBeNull();
 });
 it("rejects blank prompt, wrong values and unsupported mappings", () => {
  const values={prompt:" ",dynamicParams:{in_1:"https://example.com/frame.png",count:0,flag:false}};
  expect(gradioFormError(contract,values)).toBe("HF_CONTRACT_REQUIRED:in_0");
  expect(gradioFormError(contract,{...values,prompt:"hello",dynamicParams:{...values.dynamicParams,count:-1}})).toBe("HF_CONTRACT_RANGE:count");
  const error=gradioFormError({...contract,output:null},values)!;
  expect(gradioFormMessage(error,contract,"ko")).not.toContain("HF_CONTRACT");
 });
});
