/**
 * Leemage SDK 타입 정의
 *
 * 이 파일은 generated.ts에서 자동 생성된 타입을 재내보내고,
 * SDK 전용 헬퍼 타입을 추가합니다.
 */

import type { components } from "./generated";

// ============================================
// OpenAPI에서 자동 생성된 타입 재내보내기
// ============================================

// Common
export type StorageProvider =
  components["schemas"]["ProjectResponse"]["storageProvider"];
export type ImageFormat = components["schemas"]["VariantOption"]["format"];

// Projects
export type Project = components["schemas"]["ProjectResponse"];
export type ProjectDetails = components["schemas"]["ProjectDetailsResponse"];
export type CreateProjectRequest =
  components["schemas"]["CreateProjectRequest"];
export type UpdateProjectRequest =
  components["schemas"]["UpdateProjectRequest"];

// Files
export type VariantOption = components["schemas"]["VariantOption"];
export type ImageVariantData = components["schemas"]["ImageVariantData"];
export type FileResponse = components["schemas"]["FileResponse"];
export type PresignRequest = components["schemas"]["PresignRequest"];
export type PresignResponse = components["schemas"]["PresignResponse"];
export type ConfirmRequest = components["schemas"]["ConfirmRequest"];
export type ConfirmResponse = components["schemas"]["ConfirmResponse"];

// Errors
export type ErrorResponse = components["schemas"]["ErrorResponse"];
export type MessageResponse = components["schemas"]["MessageResponse"];

// ============================================
// SDK 전용 헬퍼 타입
// ============================================

/**
 * 이미지 크기 프리셋
 */
export type SizePreset = "source" | "max300" | "max800" | "max1920";

/**
 * 이미지 크기 레이블 (프리셋 또는 커스텀 "WIDTHxHEIGHT" 형식)
 */
export type SizeLabel = SizePreset | `${number}x${number}`;

/**
 * 파일 업로드 옵션
 */
export interface UploadOptions {
  /**
   * 이미지 변환 옵션 (이미지 파일에만 적용)
   */
  variants?: VariantOption[];

  /**
   * 업로드 진행 콜백
   */
  onProgress?: (progress: UploadProgress) => void;
}

/**
 * 업로드 진행 상태
 */
export interface UploadProgress {
  stage: "presign" | "upload" | "confirm";
  percent?: number;
}

/**
 * 업로드 가능한 파일 타입 (브라우저 File 또는 Node.js 호환)
 */
export interface UploadableFile {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
