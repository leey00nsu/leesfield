export type QueueStatusItem = {
  type: "image" | "video" | "audio";
  model: string;
  pending: number;
  processing: number;
};

export type QueueStatusResponse = {
  updatedAt: string;
  items: QueueStatusItem[];
};
