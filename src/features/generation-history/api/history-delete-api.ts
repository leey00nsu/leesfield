import type { GenerationHistoryItem } from "@/entities/generation/model/types";

export async function deleteHistoryItem(
  item: Pick<GenerationHistoryItem, "id" | "type">,
) {
  const endpoint =
    item.type === "video"
      ? `/api/video-generation/${item.id}`
      : item.type === "audio"
        ? `/api/audio-generation/${item.id}`
      : `/api/image-generation/${item.id}`;

  const response = await fetch(endpoint, {
    method: "DELETE",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.message ?? "히스토리 삭제에 실패했습니다.";
    throw new Error(message);
  }
}
