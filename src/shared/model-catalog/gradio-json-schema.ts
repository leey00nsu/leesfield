
import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020";
import type {ValidateFunction} from "ajv";

const options = {strictSchema:true, strictTypes:false, strictTuples:false, strictRequired:false, allowUnionTypes:true, validateFormats:false, addUsedSchema:false, ownProperties:true};
const draft7 = new Ajv(options);
const draft2020 = new Ajv2020(options);
const cache = new Map<string,ValidateFunction>();

// Only synchronous compilation: unresolved or remote references are not fetched.
export function gradioSchemaValidator(schema: Record<string,unknown>): ValidateFunction {
 const key=JSON.stringify(schema);
 if(key.length>100_000) throw new Error("SCHEMA_SIZE_LIMIT");
 const existing=cache.get(key); if(existing) return existing;
 if(schema.$async) throw new Error("ASYNC_SCHEMA");
 const instance = String(schema.$schema??"").includes("2020-12") || "prefixItems" in schema ? draft2020 : draft7;
 const validate=instance.compile(schema);
 instance.removeSchema(schema);
 if(cache.size>=128) cache.delete(cache.keys().next().value!);
 cache.set(key,validate);return validate;
}

export function resolveGradioSchema(schema: Record<string,unknown>, root=schema, seen=new Set<string>()): Record<string,unknown> {
 if(typeof schema.$ref!=="string") return schema;
 const ref=schema.$ref;
 if(!ref.startsWith("#/")||seen.has(ref)||seen.size>12) return schema;
 let target:unknown=root;
 for(const part of ref.slice(2).split("/").map(s=>s.replaceAll("~1","/").replaceAll("~0","~"))) {
  if(!target||typeof target!=="object"||!Object.prototype.hasOwnProperty.call(target,part)) return schema;
  target=(target as Record<string,unknown>)[part];
 }
 if(!target||typeof target!=="object"||Array.isArray(target)) return schema;
 return resolveGradioSchema(target as Record<string,unknown>,root,new Set([...seen,ref]));
}

export function gradioSchemaContainsFileData(schema: Record<string,unknown>, root=schema, depth=0): boolean {
 if(depth>12)return true;
 const resolved=resolveGradioSchema(schema,root);
 if(resolved.title==="FileData"||String(resolved.$ref??"").endsWith("/FileData")) return true;
 const children=[...Object.values((resolved.properties??{}) as Record<string,unknown>),resolved.items,...(["anyOf","oneOf","allOf"].flatMap(k=>Array.isArray(resolved[k])?resolved[k] as unknown[]:[]))];
 return children.some(v=>v&&typeof v==="object"&&!Array.isArray(v)&&gradioSchemaContainsFileData(v as Record<string,unknown>,root,depth+1));
}
