/**
 * Keeps one submission identifier per user intent.
 *
 * A network retry of the same submit reuses the identifier so the server can
 * converge it onto the original request. A rejected request or a completed
 * request ends the intent, so the next click is a new submission.
 */
export type SubmissionIntent = {
  take: (fingerprint: string) => string;
  settle: (key: string, error?: unknown) => void;
};

function newKey(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random ?? "intent-" + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function createSubmissionIntent(): SubmissionIntent {
  let key: string | null = null;
  let fingerprint: string | null = null;

  return {
    take(nextFingerprint) {
      if (fingerprint !== nextFingerprint) {
        key = null;
        fingerprint = nextFingerprint;
      }
      key ??= newKey();
      return key;
    },
    settle(settledKey, error?: unknown) {
      if (settledKey !== key) return;
      if (error === undefined) {
        key = null;
        fingerprint = null;
        return;
      }
      const status = (error as { status?: number } | null)?.status;
      // Transport and server faults may be retried with the same identifier;
      // a rejected request is finished and the next attempt is a new intent.
      if (typeof status === "number" && status < 500) {
        key = null;
        fingerprint = null;
      }
    },
  };
}
