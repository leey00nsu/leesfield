import { getGradioContract } from "./gradio-contract";

export const fileInputPort = (media:string,name:string) => `${media}-field-${name}`;
export function parseFileInputPort(port:string) {
  const match=/^(image|video|audio)-field-([a-zA-Z][a-zA-Z0-9_]*)$/.exec(port);
  return match ? {media:match[1] as "image"|"video"|"audio",name:match[2]} : null;
}
export function contractInputPorts(model:Parameters<typeof getGradioContract>[0]) {
  const contract=getGradioContract(model);
  return contract?.inputs.filter(f=>["file","files","gallery"].includes(f.kind)&&f.media).map(f=>({
    name:fileInputPort(f.media!,f.name),type:f.media!,label:f.label??f.name,required:f.required,
    multiple:f.kind!=="file",maxItems:typeof f.schema.maxItems==="number"?f.schema.maxItems:undefined,
  }));
}
export function fileInputsFromAssets(assets:ReadonlyArray<{portId:string;url:string}>) {
  const inputs:Record<string,string[]>={};
  for(const asset of assets){const port=parseFileInputPort(asset.portId);if(port)(inputs[port.name]??=[]).push(asset.url);}
  return inputs;
}
