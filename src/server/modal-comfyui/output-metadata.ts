import { normalizeMediaOutputs, type MediaOutput } from "@/server/media-assets/binary-media-output";
import { videoOutputMetadata } from "@/server/media-assets/video-output-metadata";
import { mediaInspectionInternals } from "@/server/media-assets/media-inspection";
import { ModalApiError } from "./client";

export async function modalOutputMetadata(refs:MediaOutput[],media:"image"|"video") {
 if(media==="video") return videoOutputMetadata(refs);
 const results=[];
 for(const output of await normalizeMediaOutputs(refs,media)) {
  const dimensions=mediaInspectionInternals.imageDimensions(output.buffer,output.contentType);
  if(!dimensions || dimensions.width<=0 || dimensions.height<=0) throw new ModalApiError("MODAL_OUTPUT_DIMENSIONS");
  results.push({...dimensions,duration_sec:undefined});
 }
 if(!results.length) throw new ModalApiError("MODAL_OUTPUT_EMPTY");
 return {...results[0], outputs:results};
}
