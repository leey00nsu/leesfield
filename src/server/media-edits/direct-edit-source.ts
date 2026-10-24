import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { downloadVideoInput, runVideoProcess } from "@/server/media-operations/ffmpeg-video-processor";

/** Old uploaded videos can lack dimensions. Measure owned bytes without modifying the original asset. */
export async function inspectDirectVideoSource(ownerEmail: string, assetId: string) {
  const asset = await mediaAssetService.get(ownerEmail, assetId), directory = await mkdtemp(join(tmpdir(), "leesfield-edit-source-"));
  try {
    const signal = AbortSignal.timeout(60_000), file = join(directory, "source");
    await downloadVideoInput(asset.url, file, 500 * 1024 * 1024, signal);
    const { stdout } = await runVideoProcess("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries",
      "format=duration:stream=width,height,sample_aspect_ratio:stream_tags=rotate:stream_side_data=rotation", "-of", "json", file], signal);
    const data = JSON.parse(stdout), stream = data.streams?.[0];
    const [num, den] = String(stream?.sample_aspect_ratio ?? "1:1").split(":").map(Number), sar = num > 0 && den > 0 ? num / den : 1;
    const rotated = Math.abs(Number(stream?.side_data_list?.[0]?.rotation ?? stream?.tags?.rotate ?? 0)) % 180 === 90;
    const width = rotated ? Number(stream?.height) : Math.round(Number(stream?.width) * sar);
    const height = rotated ? Math.round(Number(stream?.width) * sar) : Number(stream?.height);
    const durationMs = Math.round(Number(data.format?.duration) * 1000);
    if (![width, height, durationMs].every(n => Number.isSafeInteger(n) && n > 0) || width > 8192 || height > 8192 || durationMs > 600_000)
      throw new Error("EDIT_SOURCE_UNSUPPORTED");
    return { width, height, durationMs };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
