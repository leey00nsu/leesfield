import type { FetchClient } from "../utils/fetch";
import type {
  FileResponse,
  PresignRequest,
  PresignResponse,
  ConfirmRequest,
  ConfirmResponse,
  MessageResponse,
  UploadOptions,
  UploadableFile,
} from "../types/api";
import { NetworkError } from "../errors";

/**
 * Files API 클라이언트
 */
export class FilesResource {
  constructor(private readonly client: FetchClient) {}

  /**
   * Presigned URL 생성
   *
   * @param projectId - 프로젝트 ID
   * @param data - Presign 요청 데이터
   */
  async presign(
    projectId: string,
    data: PresignRequest
  ): Promise<PresignResponse> {
    return this.client.post<PresignResponse>(
      `/api/v1/projects/${projectId}/files/presign`,
      data
    );
  }

  /**
   * 업로드 완료 확인
   *
   * @param projectId - 프로젝트 ID
   * @param data - Confirm 요청 데이터
   */
  async confirm(
    projectId: string,
    data: ConfirmRequest
  ): Promise<ConfirmResponse> {
    return this.client.post<ConfirmResponse>(
      `/api/v1/projects/${projectId}/files/confirm`,
      data
    );
  }

  /**
   * 파일 삭제
   *
   * @param projectId - 프로젝트 ID
   * @param fileId - 파일 ID
   *
   * @example
   * ```ts
   * await client.files.delete("clq1234abcd", "file5678efgh");
   * ```
   */
  async delete(projectId: string, fileId: string): Promise<MessageResponse> {
    return this.client.delete<MessageResponse>(
      `/api/v1/projects/${projectId}/files/${fileId}`
    );
  }

  /**
   * 파일 업로드 (고수준 헬퍼)
   *
   * presign → 직접 업로드 → confirm 플로우를 자동으로 처리합니다.
   *
   * @param projectId - 프로젝트 ID
   * @param file - 업로드할 파일
   * @param options - 업로드 옵션 (이미지 변환 등)
   *
   * @example
   * ```ts
   * // 브라우저에서
   * const input = document.querySelector('input[type="file"]');
   * const file = input.files[0];
   *
   * const result = await client.files.upload("projectId", file, {
   *   variants: [
   *     { sizeLabel: "max800", format: "webp" },
   *     { sizeLabel: "1200x800", format: "avif" }
   *   ],
   *   onProgress: (progress) => console.log(progress)
   * });
   * ```
   *
   * @example
   * ```ts
   * // Node.js에서
   * import { readFile } from "fs/promises";
   *
   * const buffer = await readFile("./image.jpg");
   * const file = {
   *   name: "image.jpg",
   *   type: "image/jpeg",
   *   size: buffer.byteLength,
   *   arrayBuffer: async () => buffer
   * };
   *
   * const result = await client.files.upload("projectId", file);
   * ```
   */
  async upload(
    projectId: string,
    file: UploadableFile,
    options: UploadOptions = {}
  ): Promise<FileResponse> {
    const { variants, onProgress } = options;

    // 1. Presign 요청
    onProgress?.({ stage: "presign" });

    const presignData: PresignRequest = {
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size,
    };

    const presignResult = await this.presign(projectId, presignData);

    // 2. Presigned URL로 직접 업로드
    onProgress?.({ stage: "upload", percent: 0 });

    const fileBuffer = await file.arrayBuffer();

    try {
      const uploadResponse = await fetch(presignResult.presignedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: fileBuffer,
      });

      if (!uploadResponse.ok) {
        throw new NetworkError(
          `파일 업로드에 실패했습니다: ${uploadResponse.statusText}`
        );
      }
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }
      throw new NetworkError(
        error instanceof Error ? error.message : "파일 업로드에 실패했습니다."
      );
    }

    onProgress?.({ stage: "upload", percent: 100 });

    // 3. Confirm 요청
    onProgress?.({ stage: "confirm" });

    const confirmData: ConfirmRequest = {
      fileId: presignResult.fileId,
      objectName: presignResult.objectName,
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size,
      variants,
    };

    const confirmResult = await this.confirm(projectId, confirmData);

    return confirmResult.file;
  }
}
