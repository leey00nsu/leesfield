// Main Client
export { LeemageClient } from "./client";
export type { LeemageClientOptions } from "./client";

// Resources
export { ProjectsResource } from "./resources/projects";
export { FilesResource } from "./resources/files";

// Types
export type {
  // Common
  StorageProvider,
  ImageFormat,
  SizePreset,
  SizeLabel,
  // Projects
  Project,
  ProjectDetails,
  CreateProjectRequest,
  UpdateProjectRequest,
  // Files
  VariantOption,
  ImageVariantData,
  FileResponse,
  PresignRequest,
  PresignResponse,
  ConfirmRequest,
  ConfirmResponse,
  // Upload
  UploadOptions,
  UploadProgress,
  UploadableFile,
  // Common Responses
  ErrorResponse,
  MessageResponse,
} from "./types/api";

// Errors
export {
  LeemageError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  FileTooLargeError,
  ServerError,
  NetworkError,
} from "./errors";
