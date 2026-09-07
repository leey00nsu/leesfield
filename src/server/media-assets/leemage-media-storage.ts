import { imageUploadOptions, mapUploadedImage } from "./image-upload-policy";
import {
  LeemageClient,
  type ConfirmRequest,
  type FileResponse,
} from "leemage-sdk";

import { MediaStorageUnavailableError } from "./media-asset-errors";
import { inspectMediaUrl } from "./media-inspection";
import type { MediaStorageAdapter } from "./media-storage";
import { leemageFileName } from "@/server/shared/leemage-file-name";

type LeemageConfig = { apiKey: string; baseUrl: string; projectId: string };

let cachedClient: LeemageClient | null = null;
let cachedConfig: LeemageConfig | null = null;

function readConfig(): LeemageConfig {
  const apiKey = process.env.LEEMAGE_API_KEY?.trim();
  const projectId = process.env.LEEMAGE_PROJECT_ID?.trim();
  if (!apiKey || !projectId) throw new MediaStorageUnavailableError({
    stage: "configuration", reason: "missing_configuration",
  });
  return {
    apiKey,
    projectId,
    baseUrl: process.env.LEEMAGE_BASE_URL?.trim() || "https://leemage.leey00nsu.com",
  };
}

function clientAndProject() {
  const config = readConfig();
  if (
    !cachedClient ||
    !cachedConfig ||
    cachedConfig.apiKey !== config.apiKey ||
    cachedConfig.baseUrl !== config.baseUrl ||
    cachedConfig.projectId !== config.projectId
  ) {
    cachedClient = new LeemageClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeout: 20_000,
      allowInsecureHttp:
        process.env.NODE_ENV !== "production" && config.baseUrl.startsWith("http://"),
    });
    cachedConfig = config;
  }
  return { client: cachedClient, projectId: config.projectId };
}

// Only share work that is still in flight; signed URL lifetimes are not assumed.
const projectReads = new WeakMap<LeemageClient, Map<string, ReturnType<LeemageClient["projects"]["get"]>>>();
function readProject(client: LeemageClient, projectId: string) {
  let reads = projectReads.get(client);
  if (!reads) { reads = new Map(); projectReads.set(client, reads); }
  let pending = reads.get(projectId);
  if (!pending) {
    pending = client.projects.get(projectId);
    reads.set(projectId, pending);
    const release = () => { if (reads.get(projectId) === pending) reads.delete(projectId); };
    void pending.then(release, release);
  }
  return pending;
}

function fileUrl(file: FileResponse, fallback: string) {
  return file.url ?? file.variants.find((variant) => variant.url)?.url ?? fallback;
}

export const leemageMediaStorageAdapter: MediaStorageAdapter = {
  name: "leemage",
  assertAvailable() {
    readConfig();
  },
  async presign(input) {
    const { client, projectId } = clientAndProject();
    const fileName = leemageFileName(input.fileName);
    const result = await client.files.presign(projectId, {
      fileName,
      contentType: input.mimeType,
      fileSize: input.bytes,
    });
    return {
      fileName,
      objectId: result.fileId,
      objectName: result.objectName,
      objectUrl: result.objectUrl,
      presignedUrl: result.presignedUrl,
      expiresAt: new Date(result.expiresAt),
    };
  },
  async confirm(input) {
    const { client, projectId } = clientAndProject();
    const request: ConfirmRequest = {
      ...imageUploadOptions(input.mimeType),
      fileId: input.objectId,
      objectName: input.objectName,
      fileName: input.fileName,
      contentType: input.mimeType,
      fileSize: input.bytes,
    };
    projectReads.get(client)?.delete(projectId);
    const result = await client.files.confirm(projectId, request);
    return {
      objectId: result.file.id,
      mimeType: result.file.mimeType,
      bytes: result.file.size,
      url: fileUrl(result.file, input.objectUrl),
      ...(input.mimeType.startsWith("image/") ? mapUploadedImage(result.file, { url: input.objectUrl }) : {}),
    };
  },
  inspect: inspectMediaUrl,
  async resolveReadUrl(objectId, fallbackUrl) {
    const { client, projectId } = clientAndProject();
    const project = await readProject(client, projectId);
    const file = project.files.find((candidate) => candidate.id === objectId);
    if (!file) throw new MediaStorageUnavailableError();
    const resolved = file.url ?? file.variants.find((variant) => variant.url)?.url ?? fallbackUrl;
    if (!resolved) throw new MediaStorageUnavailableError();
    return resolved;
  },
  async delete(objectId) {
    const { client, projectId } = clientAndProject();
    projectReads.get(client)?.delete(projectId);
    await client.files.delete(projectId, objectId);
  },
};

// Used only for owner-scoped history results, including legacy rows without file IDs.
export async function deleteHistoryStorageFile(objectId: string | null, url: string | null) {
  const { client, projectId } = clientAndProject();
  if (!objectId) {
    if (!url) throw new MediaStorageUnavailableError();
    const project = await readProject(client, projectId);
    const file = project.files.find(file => file.url === url || file.thumbnail?.url === url || file.variants.some(variant => variant.url === url));
    if (!file) return; // An already removed legacy object is an idempotent success.
    objectId = file.id;
  }
  try { await client.files.delete(projectId, objectId); }
  catch (error) {
    if (!(error && typeof error === "object" && "status" in error && error.status === 404)) throw error;
  }
}
