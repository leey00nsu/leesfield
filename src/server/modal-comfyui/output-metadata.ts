import { Input, BufferSource, ALL_FORMATS } from "mediabunny";
import { mediaInspectionInternals } from "@/server/media-assets/media-inspection";
import { ModalApiError } from "./client";

export async function modalOutputMetadata(urls:string[],media:"image"|"video") {
 const results=[];
 for(const url of urls) {
  const comma=url.indexOf(","), mime=url.slice(5,url.indexOf(";"));
  const bytes=Buffer.from(url.slice(comma+1),"base64");
  if(media==="image") {
   const dimensions=mediaInspectionInternals.imageDimensions(bytes,mime);
   if(!dimensions || dimensions.width<=0 || dimensions.height<=0) throw new ModalApiError("MODAL_OUTPUT_DIMENSIONS");
   results.push({...dimensions,duration_sec:undefined});
  } else {
   const input=new Input({source:new BufferSource(bytes),formats:ALL_FORMATS});
   try {
    const track=await input.getPrimaryVideoTrack(),duration=await input.computeDuration();
    if(!track || !Number.isFinite(duration) || duration<=0) throw new ModalApiError("MODAL_OUTPUT_VIDEO_INVALID");
    results.push({width:track.displayWidth,height:track.displayHeight,duration_sec:duration});
   } finally {input.dispose();}
  }
 }
 if(!results.length) throw new ModalApiError("MODAL_OUTPUT_EMPTY");
 return {...results[0], outputs:results};
}
