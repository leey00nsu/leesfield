import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  COMFY_CLOUD_URL,
  COMFY_HEADERS,
  buildComfyHeaders,
  clampJobTimeoutMs,
  comfyConfigError,
  defaultComfySettings,
  getComfySettings,
  normalizeComfySettings,
  resolveComfyConnection,
  saveComfySettings,
  COMFY_SETTINGS_KEY,
  type ComfySettings,
} from "../settings";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock, writable: true });

const settings = (overrides: Partial<ComfySettings> = {}): ComfySettings => ({
  ...defaultComfySettings,
  ...overrides,
});

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});

describe("normalizeComfySettings", () => {
  it("defaults to Comfy Cloud", () => {
    expect(normalizeComfySettings(null).mode).toBe("cloud");
  });

  it("fills in fields a stored blob predates", () => {
    const merged = normalizeComfySettings({ mode: "local", localUrl: "http://x:8188" });
    expect(merged.randomizeSeeds).toBe(true);
    expect(merged.cloudUrl).toBe(COMFY_CLOUD_URL);
  });

  it("rejects an unknown mode rather than trusting it", () => {
    expect(normalizeComfySettings({ mode: "quantum" as never }).mode).toBe("cloud");
  });

  it("strips trailing slashes so URLs never double up", () => {
    const merged = normalizeComfySettings({ localUrl: "http://127.0.0.1:8188///" });
    expect(merged.localUrl).toBe("http://127.0.0.1:8188");
  });

  it("clamps the job timeout to a sane range", () => {
    expect(normalizeComfySettings({ jobTimeoutMs: 5 }).jobTimeoutMs).toBe(60_000);
    expect(normalizeComfySettings({ jobTimeoutMs: 99_999_999 }).jobTimeoutMs).toBe(3_600_000);
    expect(normalizeComfySettings({ jobTimeoutMs: NaN }).jobTimeoutMs).toBe(1_800_000);
  });
});

describe("clampJobTimeoutMs", () => {
  it("keeps a value that is already in range", () => {
    expect(clampJobTimeoutMs(900_000)).toBe(900_000);
    expect(clampJobTimeoutMs("900000")).toBe(900_000);
  });

  it("brings an out-of-range value to the nearest bound", () => {
    expect(clampJobTimeoutMs(5)).toBe(60_000);
    expect(clampJobTimeoutMs(99_999_999)).toBe(3_600_000);
  });

  it("treats a value that was never supplied as absent, not as zero", () => {
    // `headers.get()` answers `null` for a header that is not there, and
    // `Number(null)` is 0 — which is finite, so it used to clamp to the *lower
    // bound*. A request without the header ran on a one-minute job timeout
    // instead of thirty, and every long render was cancelled part-way through.
    expect(clampJobTimeoutMs(null)).toBe(1_800_000);
    expect(clampJobTimeoutMs(undefined)).toBe(1_800_000);
    expect(clampJobTimeoutMs("")).toBe(1_800_000);
    expect(clampJobTimeoutMs("not a number")).toBe(1_800_000);
  });

  it("still honours a deliberate zero by bringing it into range", () => {
    // Explicitly asking for none of it is a value, not an omission.
    expect(clampJobTimeoutMs(0)).toBe(60_000);
    expect(clampJobTimeoutMs("0")).toBe(60_000);
  });
});

describe("get/saveComfySettings", () => {
  it("round-trips through localStorage", () => {
    saveComfySettings(settings({ mode: "local", localUrl: "http://127.0.0.1:9000" }));
    const loaded = getComfySettings();
    expect(loaded.mode).toBe("local");
    expect(loaded.localUrl).toBe("http://127.0.0.1:9000");
  });

  it("falls back to defaults on corrupted storage", () => {
    localStorageMock.getItem.mockReturnValueOnce("{not json");
    expect(getComfySettings().mode).toBe("cloud");
  });

  it("stores under the documented key", () => {
    saveComfySettings(settings());
    expect(localStorageMock.setItem).toHaveBeenCalledWith(COMFY_SETTINGS_KEY, expect.any(String));
  });
});

describe("resolveComfyConnection", () => {
  it("returns null until cloud has a key — there is nothing to connect to", () => {
    expect(resolveComfyConnection(settings({ mode: "cloud" }))).toBeNull();
  });

  it("drives cloud through the SDK", () => {
    const connection = resolveComfyConnection(settings({ mode: "cloud", cloudApiKey: "comfyui-x" }));
    expect(connection).toMatchObject({
      mode: "cloud",
      baseUrl: COMFY_CLOUD_URL,
      apiKey: "comfyui-x",
      useSdk: true,
    });
  });

  it("drives a stock local install over the legacy API", () => {
    const connection = resolveComfyConnection(settings({ mode: "local" }));
    // A stock ComfyUI has no /api/v2 routes — the SDK cannot drive it.
    expect(connection).toMatchObject({ mode: "local", useSdk: false, apiKey: null });
  });

  it("uses the SDK for a local install behind comfy-api-proxy", () => {
    expect(resolveComfyConnection(settings({ mode: "local", localUsesApiV2: true }))?.useSdk).toBe(
      true
    );
  });

  it("returns null for a remote mode with no URL", () => {
    expect(resolveComfyConnection(settings({ mode: "remote" }))).toBeNull();
  });
});

describe("comfyConfigError", () => {
  it("names the missing piece per mode", () => {
    expect(comfyConfigError(settings({ mode: "cloud" }))).toMatch(/API key/);
    expect(comfyConfigError(settings({ mode: "remote" }))).toMatch(/remote ComfyUI/);
    expect(comfyConfigError(settings({ mode: "local" }))).toBeNull();
    expect(comfyConfigError(settings({ mode: "cloud", cloudApiKey: "k" }))).toBeNull();
  });
});

describe("buildComfyHeaders", () => {
  it("carries the connection so a route needs no server config", () => {
    const headers = buildComfyHeaders(settings({ mode: "cloud", cloudApiKey: "comfyui-x" }));
    expect(headers[COMFY_HEADERS.mode]).toBe("cloud");
    expect(headers[COMFY_HEADERS.baseUrl]).toBe(COMFY_CLOUD_URL);
    expect(headers[COMFY_HEADERS.apiKey]).toBe("comfyui-x");
    expect(headers[COMFY_HEADERS.apiV2]).toBe("1");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("falls back to the cloud key for partner-node auth", () => {
    const headers = buildComfyHeaders(settings({ mode: "cloud", cloudApiKey: "comfyui-x" }));
    expect(headers[COMFY_HEADERS.orgKey]).toBe("comfyui-x");
  });

  it("prefers an explicit partner-node key over the cloud one", () => {
    const headers = buildComfyHeaders(
      settings({ mode: "cloud", cloudApiKey: "comfyui-x", comfyOrgApiKey: "comfyui-partner" })
    );
    expect(headers[COMFY_HEADERS.orgKey]).toBe("comfyui-partner");
  });

  it("sends no key for a local install that has no auth", () => {
    const headers = buildComfyHeaders(settings({ mode: "local" }));
    expect(headers[COMFY_HEADERS.apiKey]).toBeUndefined();
    expect(headers[COMFY_HEADERS.apiV2]).toBe("0");
  });

  it("omits connection headers entirely when nothing is configured", () => {
    const headers = buildComfyHeaders(settings({ mode: "cloud" }));
    expect(headers[COMFY_HEADERS.baseUrl]).toBeUndefined();
  });
});
