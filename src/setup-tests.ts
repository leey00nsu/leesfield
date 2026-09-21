import "@testing-library/jest-dom/vitest";
import {
  allowAllRateLimitStore,
  setRateLimitStoreForTests,
} from "@/server/rate-limit/limiter";
import {
  createInMemorySubmissionLedger,
  setSubmissionLedgerForTests,
} from "@/server/generation-admission/submission-ledger";

// Unit and route tests must not consume the shared admission budget, and they
// must not require a database just to run a handler.
setRateLimitStoreForTests(allowAllRateLimitStore);

// Route tests keep admission semantics without writing reservations to the
// shared development database; the ledger has its own PostgreSQL suite.
setSubmissionLedgerForTests(createInMemorySubmissionLedger());

if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = class MockIntersectionObserver {
    readonly root = null;
    readonly rootMargin = "0px";
    readonly thresholds = [];

    disconnect() {
      return undefined;
    }
    observe() {
      return undefined;
    }
    takeRecords() {
      return [];
    }
    unobserve() {
      return undefined;
    }
  } as unknown as typeof IntersectionObserver;
}
