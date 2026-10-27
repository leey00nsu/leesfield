import "@testing-library/jest-dom/vitest";
import { expect } from "vitest";
import { readFile } from "node:fs/promises";

const testPath = (expect.getState().testPath ?? "").replaceAll("\\", "/");
const source = testPath ? await readFile(testPath, "utf8") : "";
if (/\/src\/(?:server\/|app\/api\/|features\/.*\/api\/)/.test(testPath)
  || /(?:@\/server\/|(?:\.\.\/)+server\/)/.test(source)) {
  await import("@/test-utils/server-fixtures");
}

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
