// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), issue: vi.fn(), update: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/server/api-key/handlers/issue-api-key", () => ({ issueApiKeyHandler: mocks.issue }));
vi.mock("@/server/api-key/handlers/update-api-key-label", () => ({ updateApiKeyLabelHandler: mocks.update }));
vi.mock("@/server/api-key/handlers/list-api-keys", () => ({ listApiKeysHandler: vi.fn() }));
import { POST } from "./route";
import { PATCH } from "./[apiKeyId]/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ isLoggedIn: true, adminEmail: "owner@example.com" });
});

describe("API key mutation body errors", () => {
  it.each(["POST", "PATCH"] as const)("returns the client message contract for invalid %s JSON", async (method) => {
    const request = new Request("http://localhost/api/api-keys", { method, headers: { "Content-Type": "application/json" }, body: "{" });
    const response = method === "POST" ? await POST(request) : await PATCH(request, { params: Promise.resolve({ apiKeyId: "key" }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "Invalid JSON" });
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(["POST", "PATCH"] as const)("returns a bounded body error before processing %s", async (method) => {
    const request = new Request("http://localhost/api/api-keys", { method, headers: { "Content-Type": "application/json", "Content-Length": "1048577" }, body: "{}" });
    const response = method === "POST" ? await POST(request) : await PATCH(request, { params: Promise.resolve({ apiKeyId: "key" }) });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ message: "BODY_TOO_LARGE" });
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
