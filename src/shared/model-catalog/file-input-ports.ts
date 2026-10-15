import { getGradioContract, fileFieldMaxItems, type GradioContract, type GradioField } from "./gradio-contract";
import { fileInputLabel } from "./file-input-presentation";

export const fileInputPort = (media:string,name:string) => `${media}-field-${name}`;
export function parseFileInputPort(port:string) {
  const match=/^(image|video|audio)-field-([a-zA-Z][a-zA-Z0-9_]*)$/.exec(port);
  return match ? {media:match[1] as "image"|"video"|"audio",name:match[2]} : null;
}
export function contractInputPorts(model:Parameters<typeof getGradioContract>[0]) {
  const contract=getGradioContract(model);
  return contract?.inputs.filter(f=>["file","files","gallery"].includes(f.kind)&&f.media).map(f=>({
    name:fileInputPort(f.media!,f.name),type:f.media!,label:fileInputLabel(f,"en"),required:f.required,
    multiple:f.kind!=="file",maxItems:fileFieldMaxItems(f) as number | undefined,
  }));
}
/** Bound and preserve positional slots supplied by owned assets or Graph edges. */
export function orderedFileSources(entries:ReadonlyArray<{url:string;sortOrder:number}>,length=0): (string|null)[] {
  if(!Number.isSafeInteger(length)||length<0||length>1000)throw new Error("FILE_SLOT_INDEX_INVALID");
  const result:(string|null)[]=Array.from({length},()=>null);
  for(const entry of entries){
    if(!Number.isSafeInteger(entry.sortOrder)||entry.sortOrder<0||entry.sortOrder>=1000||length>1000)throw new Error("FILE_SLOT_INDEX_INVALID");
    while(result.length<=entry.sortOrder)result.push(null);
    if(result[entry.sortOrder]!==null)throw new Error("FILE_SLOT_INDEX_DUPLICATE");
    result[entry.sortOrder]=entry.url;
  }
  return result;
}
export function fileInputsFromAssets(assets:ReadonlyArray<{portId:string;url:string;sortOrder?:number}>) {
  const groups:Record<string,{url:string;sortOrder:number}[]>={};
  for(const asset of assets){const port=parseFileInputPort(asset.portId);if(port){const group=groups[port.name]??=[];group.push({url:asset.url,sortOrder:asset.sortOrder??group.length});}}
  return Object.fromEntries(Object.entries(groups).map(([name,entries])=>[name,orderedFileSources(entries)]));
}

/** Legacy image ports belong to a field only when the model has one image input. */
export function fileFieldInputPorts(contract: GradioContract, field: GradioField): string[] {
  const ports = [fileInputPort(field.media!, field.name)];
  if (field.media === "image" && contract.inputs.filter(f => f.media === "image" && ["file", "files", "gallery"].includes(f.kind)).length === 1)
    ports.push("primary", "references", "initImage");
  return ports;
}

/** Snapshot canonical field ports so workers hydrate connected assets over empty UI defaults. */
export function normalizeFileInputAssets<T extends {portId: string; sortOrder: number}>(model: Parameters<typeof getGradioContract>[0], assets: readonly T[]): T[] {
  const contract = getGradioContract(model);
  if (!contract) return [...assets];
  const fields = contract.inputs.filter(f => f.media && ["file", "files", "gallery"].includes(f.kind));
  const result = [...assets];
  for (const field of fields) {
    const ports = fileFieldInputPorts(contract, field), canonical = ports[0];
    const indices = result.map((asset, index) => ports.includes(asset.portId) ? index : -1).filter(index => index >= 0);
    if (!indices.some(index => result[index].portId !== canonical)) continue;
    indices.sort((a,b) => ports.indexOf(result[a].portId) - ports.indexOf(result[b].portId) || result[a].sortOrder - result[b].sortOrder);
    indices.forEach((index, order) => { result[index] = {...result[index], portId: canonical, sortOrder: order}; });
  }
  return result;
}
