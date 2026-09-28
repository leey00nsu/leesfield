/**
 * In-Memory Image Store
 *
 * Temporary storage for images that need to be served via URL to external providers.
 * Images are stored in memory and served via /api/images/[id] endpoint.
 *
 * Features:
 * - Store base64 data URLs as binary buffers
 * - Retrieve images by unique ID
 * - Explicit cleanup, plus automatic TTL expiry and a total-bytes LRU cap so
 *   orphaned entries are reclaimed even if a caller skips deleteImage
 *
 * Note: Store is cleared on server restart (no persistence).
 */

import { randomUUID } from "crypto";

/**
 * Maximum age of a stored entry before it is considered expired (30 minutes).
 */
const MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Maximum total bytes retained across all entries (256 MB). When exceeded,
 * least-recently-used entries are evicted on insert.
 */
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;

/**
 * Stored image data with parsed content
 */
interface StoredImage {
  data: Buffer;
  mimeType: string;
}

/**
 * Internal entry wrapping stored data with bookkeeping for eviction.
 */
interface StoreEntry {
  data: Buffer;
  mimeType: string;
  storedAt: number;
}

/**
 * In-memory image storage. Map insertion order is used as the LRU order:
 * entries are re-inserted on access so the oldest key is the least recently used.
 */
const imageStore: Map<string, StoreEntry> = new Map();

/**
 * Running total of stored buffer bytes (kept in sync with imageStore).
 */
let totalBytes = 0;

/**
 * Remove a single entry and update the byte total.
 */
function removeEntry(id: string): boolean {
  const entry = imageStore.get(id);
  if (!entry) {
    return false;
  }
  totalBytes -= entry.data.byteLength;
  return imageStore.delete(id);
}

/**
 * Evict entries older than MAX_AGE_MS.
 */
function evictExpired(now: number): void {
  for (const [id, entry] of imageStore) {
    if (now - entry.storedAt > MAX_AGE_MS) {
      removeEntry(id);
    }
  }
}

/**
 * Evict least-recently-used entries until the total byte budget is satisfied.
 */
function evictOverBudget(): void {
  for (const id of imageStore.keys()) {
    if (totalBytes <= MAX_TOTAL_BYTES) {
      break;
    }
    removeEntry(id);
  }
}

/**
 * Parse a base64 data URL into its components
 *
 * @param base64DataUrl - Data URL in format: data:{mimeType};base64,{data}
 * @returns Parsed mimeType and Buffer, or null if invalid format
 */
function parseBase64DataUrl(
  base64DataUrl: string
): { mimeType: string; data: Buffer } | null {
  const match = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  const [, mimeType, base64Data] = match;
  const data = Buffer.from(base64Data, "base64");

  return { mimeType, data };
}

/**
 * Store an image and return its unique ID
 *
 * @param base64DataUrl - Image as base64 data URL (data:{mimeType};base64,{data})
 * @returns Unique ID for retrieving the image
 * @throws Error if data URL format is invalid
 */
export function storeImage(base64DataUrl: string): string {
  const parsed = parseBase64DataUrl(base64DataUrl);
  if (!parsed) {
    throw new Error(
      "Invalid base64 data URL format. Expected: data:{mimeType};base64,{data}"
    );
  }

  // Reject images larger than the entire byte budget: such an entry would be
  // evicted immediately by evictOverBudget(), leaving the returned id pointing
  // at nothing (a broken image URL).
  if (parsed.data.byteLength > MAX_TOTAL_BYTES) {
    throw new Error(
      `Image exceeds maximum storable size (${parsed.data.byteLength} bytes > ${MAX_TOTAL_BYTES} bytes)`
    );
  }

  const now = Date.now();
  evictExpired(now);

  const id = randomUUID();
  imageStore.set(id, {
    data: parsed.data,
    mimeType: parsed.mimeType,
    storedAt: now,
  });
  totalBytes += parsed.data.byteLength;

  evictOverBudget();

  return id;
}

/**
 * Retrieve a stored image by ID
 *
 * @param id - Image ID returned from storeImage
 * @returns Image data and mimeType, or null if not found
 */
export function getImage(id: string): StoredImage | null {
  const entry = imageStore.get(id);
  if (!entry) {
    return null;
  }

  // Expire on read so stale entries are never served.
  if (Date.now() - entry.storedAt > MAX_AGE_MS) {
    removeEntry(id);
    return null;
  }

  // Mark as most-recently-used by re-inserting at the end of the Map.
  imageStore.delete(id);
  imageStore.set(id, entry);

  return { data: entry.data, mimeType: entry.mimeType };
}

/**
 * Delete a stored image
 *
 * @param id - Image ID to delete
 * @returns true if image existed and was deleted, false if not found
 */
export function deleteImage(id: string): boolean {
  return removeEntry(id);
}

/**
 * Delete multiple stored images (for batch cleanup)
 *
 * @param ids - Array of image IDs to delete
 */
export function deleteImages(ids: string[]): void {
  for (const id of ids) {
    removeEntry(id);
  }
}

/**
 * Get store statistics (for debugging)
 */
export function getStoreStats(): {
  size: number;
  ids: string[];
  totalBytes: number;
} {
  return {
    size: imageStore.size,
    ids: Array.from(imageStore.keys()),
    totalBytes,
  };
}
