import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCinemaDraft } from "./use-cinema-draft";
import { useCinemaHistoryRestore } from "./use-cinema-history-restore";
import { defaultCinemaSettings } from "./cinema-contract";
import { composeCinemaPrompt } from "./cinema-prompt";
import { historyReferenceUpdates } from "@/shared/generation/history-references";
import { historyOptionUpdates } from "@/shared/generation/history-options";
import type { RuntimeImageModel } from "@/shared/model-catalog/runtime-utils";
import { runtimeImageModelsFixture, runtimeVideoModelsFixture } from "@/test-utils/fixtures/runtime-model-catalog";

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const selected = { ...defaultCinemaSettings(), camera: "16mm-film" };
it("stores selections per media and restores them without storing prompts or attachments", () => {
  const image = renderHook(() => useCinemaDraft("image"));
  act(() => image.result.current.change(selected));
  image.unmount();
  const again = renderHook(() => useCinemaDraft("image"));
  expect(again.result.current.settings).toEqual(selected);
  const video = renderHook(() => useCinemaDraft("video"));
  expect(video.result.current.settings).toBeUndefined();
  const stored = JSON.parse(localStorage.getItem("leesfield:cinema:image:v1")!);
  expect(Object.keys(stored)).toEqual(["draftVersion", "settings"]);
  expect(stored).not.toHaveProperty("prompt");
  expect(stored).not.toHaveProperty("initImages");
});
it("preserves unknown drafts for explicit reset and keeps in-memory edits on storage failure", () => {
  const raw = { ...selected, schemaVersion: 99 };
  localStorage.setItem("leesfield:cinema:image:v1", JSON.stringify({ draftVersion: 1, settings: raw }));
  const hook = renderHook(() => useCinemaDraft("image"));
  expect(hook.result.current.settings).toEqual(raw);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  act(() => hook.result.current.change(defaultCinemaSettings()));
  expect(hook.result.current.settings).toEqual(defaultCinemaSettings());
  expect(hook.result.current.error).toBe(true);
});
const saved = composeCinemaPrompt("original scene", selected, "image");
function useRestore(restorePrompt: (prompt: string) => void) {
  const draft = useCinemaDraft("image");
  const history = useCinemaHistoryRestore({ historyId: "history-1", media: "image", ready: draft.ready, revision: draft.revision, change: draft.change, restorePrompt });
  return { draft, history };
}
it.each([1, 2, 3, 4, 5, 6])("restores source text and settings from mapping %i instead of recomposing the final history prompt", async mappingVersion => {
  const { composition: _removed, ...legacy } = selected; void _removed;
  const frozen = { ...saved, schemaVersion: 1, settings: { ...legacy, schemaVersion: 1, focalLength: "85" }, mappingVersion, finalPrompt: "Saved provider prompt, preserved verbatim." };
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ cinema: frozen, prompt: frozen.finalPrompt, model: "model" })));
  vi.stubGlobal("fetch", fetcher);
  const restore = vi.fn();
  const hook = renderHook(() => useRestore(restore));
  await waitFor(() => expect(restore).toHaveBeenCalledWith("original scene"));
  expect(hook.result.current.draft.settings).toEqual({ ...selected, composition: "auto" });
  expect(restore).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toContain("history-1?type=image&origin=generation&view=authoring");
});
it("ignores a late history response after a user edit", async () => {
  let resolve!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(done => { resolve = done; })));
  const restore = vi.fn();
  const hook = renderHook(() => useRestore(restore));
  act(() => hook.result.current.draft.markEdited());
  await act(async () => resolve(new Response(JSON.stringify({ cinema: saved, prompt: saved.finalPrompt, model: "model" }))));
  expect(restore).not.toHaveBeenCalled();
  expect(hook.result.current.draft.settings).toBeUndefined();
});
it("rejects unknown/range/file options and preserves explicit zero/false with current contracts",async()=>{
 const {multiImageAttachmentModel}=await import("@/test-utils/fixtures/media-attachment-models");
 const model:RuntimeImageModel={...multiImageAttachmentModel,parameters:{...multiImageAttachmentModel.parameters,width:{default:512,min:256,max:1024,step:64,binding:{source:"hf_space",parameterName:"width",kind:"number",valueType:"number",schema:{type:"integer"},order:2}},seed:{binding:{source:"hf_space",parameterName:"seed",kind:"number",valueType:"number",schema:{type:"integer"},order:3}},enabled:{binding:{source:"hf_space",parameterName:"enabled",kind:"boolean",valueType:"boolean",schema:{type:"boolean"},order:4}}}};
 expect(historyOptionUpdates([{field:"dynamicParams.width",value:768},{field:"dynamicParams.seed",value:0},{field:"dynamicParams.enabled",value:false}],model)).toEqual({"dynamicParams.width":768,"dynamicParams.seed":0,"dynamicParams.enabled":false});
 expect(()=>historyOptionUpdates([{field:"dynamicParams.width",value:2048}],model)).toThrow();
 expect(()=>historyOptionUpdates([{field:"dynamicParams.references",value:["image"]}],model)).toThrow();
 expect(()=>historyOptionUpdates([{field:"dynamicParams.unknown",value:1}],model)).toThrow();
 const legacy=runtimeImageModelsFixture.find(m=>m.key==="flux2-klein-9b")!;
 expect(historyOptionUpdates([{field:"seed",value:0},{field:"promptUpsampling",value:false}],legacy)).toEqual({seed:"0",promptUpsampling:false});
});
it("restores ordered reference fields once before source text and keeps the draft on incompatible inputs",async()=>{
 const references=[{field:"initImages",media:"image",multiple:true,urls:["https://example.com/a.png","https://example.com/b.png"]}];
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({cinema:saved,prompt:saved.finalPrompt,model:"model",references}))));
 const files=vi.fn(); const prompt=vi.fn();
 const hook=renderHook(()=>{const draft=useCinemaDraft("image");return useCinemaHistoryRestore({historyId:"h",media:"image",ready:draft.ready,revision:draft.revision,change:draft.change,restoreInputs:files,restorePrompt:prompt});});
 await waitFor(()=>expect(files).toHaveBeenCalledWith({references,options:[]}));
 expect(prompt).toHaveBeenCalledWith(saved.sourcePrompt);
 expect(files.mock.invocationCallOrder[0]).toBeLessThan(prompt.mock.invocationCallOrder[0]);
 expect(files).toHaveBeenCalledTimes(1);hook.unmount();
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({cinema:saved,prompt:saved.finalPrompt,model:"model",references}))));
 const fail=vi.fn(()=>{throw new Error("incompatible");}); const untouched=vi.fn();
 const second=renderHook(()=>{const draft=useCinemaDraft("image");return useCinemaHistoryRestore({historyId:"other",media:"image",ready:draft.ready,revision:draft.revision,change:draft.change,restoreInputs:fail,restorePrompt:untouched});});
 await waitFor(()=>expect(second.result.current.error).toBe(true));expect(untouched).not.toHaveBeenCalled();
});
it("validates current file limits and keeps mapped field identity and order",()=>{
 const model={...runtimeVideoModelsFixture[0],parameters:{},providerConfig:{gradio_contract:{version:1,apiName:"/generate",inputs:[{name:"first_frame",label:"First",kind:"file",media:"image",schema:{},required:false,nullable:true},{name:"reference_images",label:"References",kind:"files",media:"image",schema:{maxItems:2},required:false,nullable:true}],output:{media:"video",path:[0],multiple:false},diagnostics:[],reviewed:true}}};
 const ref={field:"dynamicParams.reference_images",media:"image" as const,multiple:true,urls:["a","b"]};
 expect(historyReferenceUpdates([ref],model)).toEqual({"dynamicParams.reference_images":["a","b"]});
 expect(()=>historyReferenceUpdates([{...ref,urls:["a","b","c"]}],model)).toThrow();
 expect(()=>historyReferenceUpdates([{...ref,field:"initImage"}],model)).toThrow();
 expect(()=>historyReferenceUpdates([{...ref,field:"dynamicParams.unknown"}],model)).toThrow();
 expect(historyReferenceUpdates([{...ref,field:"initImages"}],{...runtimeImageModelsFixture[0],meta:{max_input_images:2}})).toEqual({initImages:["a","b"]});
});
it.each(["deleted", "owner", "unsupported"])("keeps the existing draft on %s history failure", async kind => {
  localStorage.setItem("leesfield:cinema:image:v1", JSON.stringify({ draftVersion: 1, settings: selected }));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(kind === "unsupported" ? new Response(JSON.stringify({ cinema: { ...saved, mappingVersion: 99 }, prompt: saved.finalPrompt, model: "model" })) : new Response(null, { status: kind === "owner" ? 401 : 404 })));
  const restore = vi.fn();
  const hook = renderHook(() => useRestore(restore));
  await waitFor(() => expect(hook.result.current.history.error).toBe(true));
  expect(restore).not.toHaveBeenCalled();
  expect(hook.result.current.draft.settings).toEqual(selected);
});

it("restores positional null audio references and rejects null in ordinary image references",()=>{
 const model={...runtimeVideoModelsFixture[0],parameters:{},providerConfig:{gradio_contract:{version:1,apiName:"/generate",inputs:[{name:"tracks",label:"Tracks",kind:"files",media:"audio",schema:{type:"array",maxItems:3,items:{anyOf:[{type:"string"},{type:"null"}]}},required:false,nullable:false}],output:{media:"video",path:[0],multiple:false},diagnostics:[],reviewed:true}}};
 const ref={field:"dynamicParams.tracks",media:"audio" as const,multiple:true,urls:[null,"https://cdn/second.wav",null]};
 expect(historyReferenceUpdates([ref],model)).toEqual({"dynamicParams.tracks":ref.urls});
 expect(()=>historyReferenceUpdates([{field:"initImages",media:"image",multiple:true,urls:[null,"a"]}],{...runtimeImageModelsFixture[0],meta:{max_input_images:2}})).toThrow();
});
