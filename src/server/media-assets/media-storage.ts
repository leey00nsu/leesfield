import type { ImageVariants } from "@/shared/media-assets/image-variants";
import type { MediaType } from "@/shared/media-assets/media-asset-contract";

export type StoragePresignResult = {
  fileName?: string;
  objectId: string;
  objectName: string;
  objectUrl: string;
  presignedUrl: string;
  expiresAt: Date;
};

export type StorageConfirmInput = {
  objectId: string;
  objectName: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  objectUrl: string;
};

export type StorageConfirmedFile = {
  imageVariants?: ImageVariants | null;
  objectId: string;
  mimeType: string;
  bytes: number;
  url: string;
};

export type InspectedMedia = {
  isAnimated?: boolean | null;
  detectedMimeType: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
};

export interface MediaStorageAdapter {
  readonly name: "leemage";
  assertAvailable(): void;
  presign(input: {
    fileName: string;
    mimeType: string;
    bytes: number;
  }): Promise<StoragePresignResult>;
  confirm(input: StorageConfirmInput): Promise<StorageConfirmedFile>;
  inspect(input: {
    url: string;
    expectedType: MediaType;
    declaredMimeType: string;
  }): Promise<InspectedMedia>;
  resolveReadUrl(objectId: string, fallbackUrl: string | null): Promise<string>;
  delete(objectId: string): Promise<void>;
}
