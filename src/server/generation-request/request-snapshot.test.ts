import {beforeEach,describe,it,expect,vi} from 'vitest';
import {requestInputs,restoreRequest,snapshotRequest} from './request-snapshot';
import {requestSettings} from '@/server/monitoring/request-settings';
const mockCatalog = vi.hoisted(() => vi.fn());
vi.mock("@/server/model-catalog/catalog-service", () => ({getModelCatalog: mockCatalog}));
const mapped = {type:'image',providerConfig:{api_name:'/generate',output:{media:'image',path:[0]}},parameters:{'hf:width':{label:'Width',default:512,binding:{source:'hf_space',parameterName:'width',valueType:'number',schema:{type:'number'},order:0}}}};
describe('simple request settings',()=>{
 beforeEach(() => { mockCatalog.mockReset(); });
 it('records model input names and values without synthetic fixed defaults',()=>{
 expect(requestInputs(mapped,{width:1024,steps:1,dynamicParams:{width:768}})).toEqual({width:768});
 });
 it('excludes unconfigured legacy defaults and unused HF bindings',()=>{
 expect(requestInputs({type:'image',parameters:{width:{},seed:{},'hf:width':{binding:{source:'hf_space',parameterName:'width'}}}},{width:768,seed:'0',modeChoice:'unused',initImagesCount:0,dynamicParams:{'hf:width':2048}})).toEqual({width:768,seed:'0'});
 });
 it('uses original names for legacy audio binding values',()=>{
 expect(requestInputs({type:'audio',parameters:{'hf:temperature':{binding:{source:'hf_space',parameterName:'temperature'}}}},{dynamicParams:{'hf:temperature':0}})).toEqual({temperature:0});
 });
 it('keeps old v2 execution compatible but presents only input names and values',()=>{
 const old={requestVersion:2,model:'m',dynamicParams:{'hf:width':768},parameterDefinitions:[{key:'hf:width',inputKey:'hf:width',name:'width',label:'Width',target:'dynamic'}]};
 expect(restoreRequest(old)).toEqual({model:'m',dynamicParams:{'hf:width':768}});expect(requestSettings(old)).toEqual({width:768});
 });
 it('sanitizes new display settings independently from execution payload',()=>{
 const stored={width:1024,requestSettings:{width:768,enabled:false,optional:null,api_key:'SECRET',file:'data:image/png;base64,SECRET',prompt:'p'}};
 expect(requestSettings(stored)).toEqual({width:768,enabled:false,optional:null,file:'[file]'});expect(restoreRequest(stored)).toBe(stored);
 });
 it('stores new file inputs as durable references instead of copying their bytes',async()=>{
  mockCatalog.mockResolvedValue([{type:'image',key:'image',provider:'codex',parameters:{initImages:{},width:{}}}]);
  const source = 'data:image/png;base64,' + 'A'.repeat(2000);
  const saved = await snapshotRequest('image',{model:'image',prompt:'p',width:512,initImages:[source]}, {
   inputAssets:[{assetId:'asset-1',field:'initImages',sortOrder:0,multiple:true,generationType:'image'}],
  });
  expect(saved).toMatchObject({requestVersion:3,initImages:[],inputAssets:[{assetId:'asset-1',field:'initImages',sortOrder:0,multiple:true}]});
  expect(saved.requestSettings).toEqual({initImages:['[file]'],width:512});
  expect(JSON.stringify(saved)).not.toContain(source);
 });
 it('strips dynamic file values while retaining the field contract for execution',async()=>{
  mockCatalog.mockResolvedValue([{type:'image',key:'image',provider:'hf_space',providerConfig:{api_name:'/generate',output:{media:'image',path:[0]}},parameters:{reference:{binding:{source:'hf_space',parameterName:'reference',kind:'file',media:'image'}}}}]);
  const source = 'data:image/png;base64,' + 'B'.repeat(2000);
  const saved = await snapshotRequest('image',{model:'image',prompt:'p',dynamicParams:{reference:source}}, {
   inputAssets:[{assetId:'asset-2',field:'dynamicParams.reference',sortOrder:0,generationType:'image'}],
  });
  expect(saved.dynamicParams).toEqual({});
  expect(saved.requestSettings).toEqual({reference:'[file]'});
  expect(JSON.stringify(saved)).not.toContain(source);
 });
});
