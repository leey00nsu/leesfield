import { withExternalApi } from "@/server/external-api/route-handler";
import { getGeneration } from "@/server/image-generation/image-generation-store";
import { getVideoGeneration } from "@/server/video-generation/video-generation-store";
import { getAudioGeneration } from "@/server/audio-generation/audio-generation-store";
import { externalGenerationStatusSchema } from "@/shared/api/external-contract";
import { buildErrorResponse, jsonWithNoStore } from "@/server/http/response";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  return withExternalApi(request, async (auth) => {
    const { requestId } = await params;
    const [image, video, audio] = await Promise.all([
      getGeneration(requestId, auth.ownerEmail),
      getVideoGeneration(requestId, auth.ownerEmail),
      getAudioGeneration(requestId, auth.ownerEmail),
    ]);
    const record = image ?? video ?? audio;
    if (!record) return buildErrorResponse("NOT_FOUND", 404);
    const type = image ? "image" : video ? "video" : "audio";
    return jsonWithNoStore(
      externalGenerationStatusSchema.parse({
        type,
        requestId: record.id,
        status: record.status,
        progress: record.progress,
        result: record.result,
        errorMessage: record.errorMessage,
      }),
    );
  });
}
