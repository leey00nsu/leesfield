import {beforeEach,describe,it,expect,vi} from 'vitest';
import {createImageGenerationRecord} from '@/server/image-generation/image-generation-repository';
import {createVideoGenerationRecord} from '@/server/video-generation/video-generation-repository';
import {createAudioGenerationRecord} from '@/server/audio-generation/audio-generation-repository';
import {restoreRequest} from './request-snapshot';
const mocks=vi.hoisted(()=>({create:vi.fn(async(value)=>value),catalog:vi.fn()}));
vi.mock('@/server/db/prisma',()=>({prisma:{imageGeneration:{create:mocks.create},videoGeneration:{create:mocks.create},audioGeneration:{create:mocks.create}}}));
vi.mock('@/server/model-catalog/catalog-service',()=>({getModelCatalog:mocks.catalog}));
beforeEach(()=>{vi.clearAllMocks();mocks.catalog.mockResolvedValue(['image','video','audio'].map(type=>({type,key:type,parameters:{width:{},height:{},steps:{},seed:{},fps:{},durationSec:{}}})));});
describe('repository snapshot persistence',()=>{
 it('writes a legacy image once and restores dimensions without model lookup',async()=>{
 await createImageGenerationRecord('r',{model:'image',prompt:'p',width:768,height:512,steps:9,imageCount:1,seed:'42'},'owner');
 const data=mocks.create.mock.calls[0][0].data;
 expect(data.requestParams.width).toBe(768);expect(data.requestParams.requestSettings.width).toBe(768);expect(data.requestParams).not.toHaveProperty('parameterDefinitions');
 expect(restoreRequest(data.requestParams)).toMatchObject({width:768,height:512,seed:'42'});
 });
 it('preserves space graph metadata through video snapshot normalization',async()=>{
 const payload={model:'video',prompt:'p',durationSec:4,resolution:720,aspectRatio:'16:9',fps:24,steps:10,guidanceScale:1};
 await createVideoGenerationRecord('r',payload,'owner',null,'node',{...payload,graphId:'graph',inputAssets:[{assetId:'asset'}]});
 const saved=mocks.create.mock.calls[0][0].data.requestParams;
 expect(saved).toMatchObject({graphId:'graph',inputAssets:[{assetId:'asset'}]});expect(saved.fps).toBe(24);expect(saved.requestSettings.fps).toBe(24);expect(restoreRequest(saved)).toMatchObject({fps:24,durationSec:4});
 });
 it('stores audio defaults once without exposing synthetic image fields for mapped audio',async()=>{
 mocks.catalog.mockResolvedValue([{type:'audio',key:'audio',providerConfig:{api_name:'/tts',output:{media:'audio',path:[0]}},parameters:{text:{label:'Text',binding:{source:'hf_space',parameterName:'text',valueType:'string',schema:{type:'string'},canonicalKey:'prompt'}}}}]);
 await createAudioGenerationRecord('r',{model:'audio',prompt:'hello',dynamicParams:{text:'hello'}},'owner');
 expect(mocks.create.mock.calls[0][0].data.requestParams.requestSettings).toEqual({text:'hello'});
 });
});
