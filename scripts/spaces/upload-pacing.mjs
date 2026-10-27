// Preserve upload-owner's two-request burst and 10/minute refill. The 100ms
// margin avoids admitting a request just before the server's refill boundary.
export function createUploadPacer(clock = Date.now) {
  const intervalMs = 6100;
  let tokens = 2, reservedAt = clock();
  return () => {
    const now = clock();
    tokens = Math.min(2, tokens + Math.max(0, now - reservedAt) / intervalMs);
    const start = Math.max(now, reservedAt);
    const wait = Math.max(0, 1 - tokens) * intervalMs;
    tokens = Math.max(0, tokens - 1);
    reservedAt = start + wait;
    return Math.max(0, reservedAt - now);
  };
}
