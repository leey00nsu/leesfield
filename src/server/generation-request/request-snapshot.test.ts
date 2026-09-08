import {describe,it,expect} from 'vitest';
import {requestInputs,restoreRequest} from './request-snapshot';
import {requestSettings} from '@/server/monitoring/request-settings';
const mapped = {type:'image',providerConfig:{api_name:'/generate',output:{media:'image',path:[0]}},parameters:{'hf:width':{label:'Width',default:512,binding:{source:'hf_space',parameterName:'width',valueType:'number',schema:{type:'number'},order:0}}}};
describe('simple request settings',()=>{
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
});
