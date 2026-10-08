import { getOwnedHistoryRecord } from "./history-record";
import { getMonitoringRequestDetail } from "@/server/monitoring/request-detail";
import { requestSettings } from "@/server/monitoring/request-settings";
import { parseImageVariants } from "@/shared/media-assets/image-variants";
import type { ExternalHistorySelector } from "@/shared/api/platform-contract";

export async function getExternalHistoryDetail(ownerEmail: string, historyId: string, selector: ExternalHistorySelector) {
  if (selector.origin === "generation") {
    const detail = await getMonitoringRequestDetail(selector.type, historyId, ownerEmail);
    return detail ? { ...detail, origin: "generation" as const } : null;
  }
  const result = await getOwnedHistoryRecord(ownerEmail, historyId, selector);
  if (!result.record || !("outputs" in result.record) || result.record.status !== "completed") return null;
  const record = result.record;
  return {
    id: record.id, type: selector.type, origin: "edit" as const,
    status: record.status, model: null, prompt: "",
    createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(),
    durationMs: Math.max(0, record.updatedAt.getTime() - record.createdAt.getTime()), progress: null,
    errorMessage: null, warningMessage: record.errorMessage,
    requestParameters: requestSettings(record.parameters),
    inputImages: record.inputs.filter(({ asset }) => asset.type === "image").flatMap(({ asset }) => asset.storageUrl ?? asset.legacyUrl ?? []),
    inputAudios: record.inputs.filter(({ asset }) => asset.type === "audio").flatMap(({ asset }) => asset.storageUrl ?? asset.legacyUrl ?? []),
    inputVideos: record.inputs.filter(({ asset }) => asset.type === "video").flatMap(({ asset }) => asset.storageUrl ?? asset.legacyUrl ?? []),
    referenceText: null,
    assets: record.outputs.flatMap((asset) => {
      const url = asset.storageUrl ?? asset.legacyUrl;
      return url ? [{ url, width: asset.width, height: asset.height, durationSec: asset.durationMs === null ? null : asset.durationMs / 1000,
        imageVariants: parseImageVariants(asset.imageVariants) }] : [];
    }),
  };
}
