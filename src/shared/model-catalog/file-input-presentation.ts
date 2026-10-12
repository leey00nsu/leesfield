import type { GradioField } from "./gradio-contract";

export type FileInputRole = "reference" | "start_frame" | "end_frame" | "video_soundtrack";

/** Remove status/count annotations while retaining the source's role description. */
export function fileRoleDescription(label: string): string {
  return label.replace(/\((?:optional|선택(?: 사항)?)(?:\s*,\s*up to \d+(?:\s+\w+)?)?\)|\(up to \d+(?:\s+\w+)?\)/gi, "").trim();
}

const signal = (value: string) => value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase().trim();

/** Explicit role metadata wins; legacy contracts use semantic signals, never model IDs. */
export function fileInputRole(field: GradioField): FileInputRole {
  if (field.attachment?.role === "paired_audio") return "video_soundtrack";
  const explicit = field.schema["x-input-role"] ?? field.schema["x-role"];
  if (["reference", "start_frame", "end_frame", "video_soundtrack"].includes(String(explicit))) return explicit as FileInputRole;
  const text = signal(field.name + " " + fileRoleDescription(field.label));
  if (field.media === "image" && /\b(start|first|initial)\s+(frame|image)\b/.test(text)) return "start_frame";
  if (field.media === "image" && /\b(end|last|final)\s+(frame|image)\b/.test(text)) return "end_frame";
  if (field.media === "audio" && /\bvideo\b/.test(text)) return "video_soundtrack";
  return "reference";
}

/** One visible/accessible label policy for contract, legacy and Space file inputs. */
export function fileInputLabel(field: GradioField, locale: string): string {
  const ko = locale === "ko";
  const role = fileInputRole(field);
  const labels: Record<FileInputRole, [string, string]> = {
    reference: [field.media === "image" ? "참조 이미지" : field.media === "video" ? "참조 영상" : field.media === "audio" ? "참조 오디오" : "참조 파일",
      field.media === "image" ? "Reference images" : field.media === "video" ? "Reference videos" : field.media === "audio" ? "Reference audio" : "Reference files"],
    start_frame: ["시작 프레임", "Start frame"],
    end_frame: ["끝 프레임", "End frame"],
    video_soundtrack: ["영상별 오디오", "Video soundtracks"],
  };
  const base = labels[role][ko ? 0 : 1];
  if (role !== "reference") return base;
  const description = fileRoleDescription(field.label || field.name);
  const words = signal(description).replace(/\b(reference|references|ref|refs|input|inputs|source|init|initial|image|images|video|videos|audio|audios|photo|photos|picture|pictures|file|files|gallery|upload|optional)\b/g, "")
    .replace(/참조|레퍼런스|이미지|영상|비디오|오디오|파일|업로드/g, "").trim();
  // Preserve an unfamiliar role rather than merging two distinct inputs.
  return words && !/^param\s*\d+$/.test(signal(description)) ? base + " · " + description : base;
}
