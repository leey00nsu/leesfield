import type {
  ImageGenerationResponse,
  ImageGenerationStatus,
} from "@/features/image-generation/model/image-generation-types";
import { getImageGenerationByRequestId } from "@/server/image-generation/image-generation-repository";

export type ImageGenerationRecord = {
  id: string;
  status: ImageGenerationStatus;
  progress: number;
  result?: ImageGenerationResponse["result"];
  errorMessage?: string;
};

function mapRecord(
  record: Awaited<ReturnType<typeof getImageGenerationByRequestId>>,
): ImageGenerationRecord | null {
  if (!record) return null;
  const images = record.images ?? [];
  const result = images.length
    ? {
        images: images.map((image) => ({
          url: image.url,
          width: image.width ?? undefined,
          height: image.height ?? undefined,
        })),
      }
    : undefined;

  return {
    id: record.requestId,
    status: record.status,
    progress: record.progress,
    result,
    errorMessage: record.errorMessage ?? undefined,
  };
}

export async function getGeneration(id: string, ownerEmail: string) {
  const record = await getImageGenerationByRequestId(id, ownerEmail);
  return mapRecord(record);
}
