import { z } from "zod";

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const cropRectangleSchema = z.object({
  x: z.number().int().min(0).max(8192), y: z.number().int().min(0).max(8192),
  width: z.number().int().min(1).max(8192), height: z.number().int().min(1).max(8192),
}).strict();
export type CropRectangle = z.infer<typeof cropRectangleSchema>;
export const directEditSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("image.crop"), rect: cropRectangleSchema }).strict(),
  z.object({ kind: z.literal("video.crop"), rect: cropRectangleSchema }).strict(),
  z.object({ kind: z.literal("video.trim"), startMs: z.number().int().min(0), endMs: z.number().int().positive().max(600_000) }).strict(),
]);
export type DirectEdit = z.infer<typeof directEditSchema>;
export const directEditRequestSchema = z.object({
  requestId: z.string().uuid(), expectedGraphVersion: z.number().int().positive(),
  sourceAssetId: id, sourceVersion: z.number().int().positive(), resultNodeId: id, resultEdgeId: id,
  edit: directEditSchema,
}).strict();
export type DirectEditRequest = z.infer<typeof directEditRequestSchema>;
export const directEditSnapshotSchema = directEditRequestSchema.omit({ expectedGraphVersion: true }).extend({
  sourceNodeId: id, width: z.number().int().positive().max(8192), height: z.number().int().positive().max(8192),
  durationMs: z.number().int().positive().max(600_000).nullable(),
}).strict();
export type DirectEditSnapshot = z.infer<typeof directEditSnapshotSchema>;
export type DirectEditStatus = "pending" | "processing" | "uploading" | "completed" | "failed" | "cancelled";
export type DirectEditDto = {
  id: string; type: string; status: DirectEditStatus; progress: number;
  resultNodeId: string; sourceAssetId: string; sourceNodeId: string;
  outputAssetId: string | null; errorCode: string | null; createdAt: string; finishedAt: string | null;
};
export const directEditTypes = ["direct.image.crop", "direct.video.trim", "direct.video.crop"] as const;
export const isDirectEditType = (value: string) => directEditTypes.some(type => type === value);
export const editOutputPort = (edit: DirectEdit) => edit.kind === "image.crop" ? "editedImage" : "editedVideo";
export const editMediaType = (edit: DirectEdit) => edit.kind === "image.crop" ? "image" as const : "video" as const;
export function isDirectEditPort(port: string) { return port === "editedImage" || port === "editedVideo"; }
export function normalizeCrop(rect: CropRectangle, width: number, height: number, video = false): CropRectangle {
  const unit = video ? 2 : 1;
  const floor = (n: number) => Math.floor(n / unit) * unit;
  const w = Math.max(unit, Math.min(floor(width), floor(rect.width)));
  const h = Math.max(unit, Math.min(floor(height), floor(rect.height)));
  return { x: Math.max(0, Math.min(floor(width - w), floor(rect.x))),
    y: Math.max(0, Math.min(floor(height - h), floor(rect.y))), width: w, height: h };
}
export function validEditGeometry(edit: DirectEdit, width: number, height: number, durationMs: number | null) {
  if (width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 32 * 1024 * 1024) return false;
  if (edit.kind === "video.trim") return durationMs !== null && edit.startMs < edit.endMs && edit.endMs <= durationMs;
  const r = edit.rect;
  return r.x + r.width <= width && r.y + r.height <= height && (edit.kind !== "video.crop"
    || [r.x, r.y, r.width, r.height].every(n => n % 2 === 0));
}
