import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createLogger, logger, serializeError } from "./logger.mjs";

afterEach(() => vi.restoreAllMocks());
describe("shared safe JSON logger", () => {
  it("writes one JSON argument with severity and bounded metadata", () => {
    const sink = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cause = Object.assign(new TypeError("fetch failed"), {code:"ECONNRESET"});
    logger.error("provider.failed", new Error("HF_SPACE_REQUEST_FAILED", {cause}), {
      requestId:"req-1", modelKey:"model", phase:"provider.generate", provider:"hf_space",
      prompt:"private prompt", apiKey:"private key", url:"https://host/?secret=value",
    });
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0]).toHaveLength(1);
    const line = String(sink.mock.calls[0][0]);
    expect(line.split("\n")).toHaveLength(1);
    expect(JSON.parse(line)).toMatchObject({
      level:"error",event:"provider.failed",requestId:"req-1",provider:"hf_space",
      error:{type:"Error",code:"HF_SPACE_REQUEST_FAILED",cause:{type:"TypeError",code:"ECONNRESET"}},
    });
    expect(line).not.toMatch(/private|https:\/\/host|secret=value/);
  });

  it("redacts arbitrary messages, values, URLs and stack headers, retaining source locations", () => {
    const error = new Error("Bearer private-key\nprivate prompt data:image/png;base64,secret");
    error.stack = error.message + "\n    at upload (/Users/private-home/project/src/server/upload.ts:42:9)\n    at https://private-host/?token=secret:1:1";
    const result = serializeError(error);
    expect(result).toMatchObject({message:"[redacted]",frames:["src/server/upload.ts:42:9"]});
    expect(JSON.stringify(result)).not.toMatch(/Bearer|private|secret|base64|https/);
  });

  it("keeps bounded validation paths and codes without issue messages or received values", () => {
    const parsed = z.object({assets:z.array(z.object({id:z.number()}))}).safeParse({assets:[{id:"secret-input"}]});
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(serializeError(parsed.error)).toMatchObject({
      type:"ZodError",issues:[{code:"invalid_type",path:["assets",0,"id"]}],
    });
    expect(JSON.stringify(serializeError(parsed.error))).not.toContain("secret-input");
  });

  it("limits recursive/aggregate errors and does not evaluate arbitrary toJSON", () => {
    const error = new Error("MODAL_NETWORK");
    Object.defineProperty(error, "cause", {value:error});
    expect(serializeError(error).cause).toEqual({type:"CircularError"});
    const aggregate = new AggregateError(Array.from({length:20},()=>new Error("FAILED")),"private");
    expect(serializeError(aggregate).errors).toHaveLength(4);
    const toJSON=vi.fn(()=>{throw new Error("private");});
    serializeError({name:"Error",message:"private",toJSON});
    expect(toJSON).not.toHaveBeenCalled();
    expect(serializeError("private input")).toEqual({type:"string",message:"[redacted]"});
  });

  it("handles throwing getters, non-finite values and broken sinks without changing work", () => {
    const object = Object.defineProperty({}, "message", {get(){throw new Error("secret");}});
    expect(() => serializeError(object)).not.toThrow();
    const sink = vi.spyOn(console,"error").mockImplementation(()=>{throw new Error("sink unavailable");});
    expect(()=>logger.error("event",object,{durationMs:Infinity})).not.toThrow();
    expect(sink).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(sink.mock.calls[0][0]))).not.toHaveProperty("durationMs");
    expect(()=>createLogger(()=>{throw new Error("context");}).error("event",object)).not.toThrow();
  });

  it("reads context at log time and permits explicit operation fields to override it", () => {
    const sink=vi.spyOn(console,"log").mockImplementation(()=>undefined);
    const contextual=createLogger(()=>({requestId:"parent",phase:"provider.generate"}));
    contextual.info("operation",{phase:"storage.confirm"});
    expect(JSON.parse(String(sink.mock.calls[0][0]))).toMatchObject({requestId:"parent",phase:"storage.confirm"});
  });
});
