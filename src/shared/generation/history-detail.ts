export type HistoryInputMedia = {
  assetId: string | null;
  type: "image" | "video" | "audio";
  role: string;
  sortOrder: number;
  url: string;
};
