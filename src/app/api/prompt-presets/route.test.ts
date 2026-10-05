// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => vi.fn());
const service = vi.hoisted(() => ({
  list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), restore: vi.fn(), remove: vi.fn(),
}));
vi.mock("@/server/auth/session", () => ({ getSession: session }));
vi.mock("@/server/prompt-presets/prompt-preset-service", () => ({ promptPresetService: service }));
import { PromptPresetError } from "@/server/prompt-presets/prompt-preset-errors";
import { GET, POST } from "./route";
import { PATCH, DELETE } from "./[key]/route";
import { POST as RESTORE } from "./[key]/restore/route";

const url = "http://localhost/api/prompt-presets";
const context = { params: Promise.resolve({ key: "character-sheet-creator" }) };
const mutation = (method: string, body: unknown, headers: Record<string, string> = {}) => new Request(url, {
  method, body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers },
});

describe("프리셋 API 인증/입력/충돌", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.mockResolvedValue({ isLoggedIn: true, adminEmail: "authenticated@example.com" });
  });
  it("미로그인은 조회와 변경 전에 거절한다", async () => {
    session.mockResolvedValue({ isLoggedIn: false });
    expect((await GET(new Request(url))).status).toBe(401);
    expect((await POST(mutation("POST", {}))).status).toBe(401);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.create).not.toHaveBeenCalled();
  });
  it("검색 매체/관리 상태를 session owner와 연결하고 캐시하지 않는다", async () => {
    service.list.mockResolvedValue([{ key: "personal", prompt: "saved text" }]);
    const result = await GET(new Request(url + "?modality=image&includeInactive=true"));
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(service.list).toHaveBeenCalledWith("authenticated@example.com", { modality: "image", includeInactive: true });
    expect((await GET(new Request(url + "?includeInactive=invalid"))).status).toBe(400);
  });
  it("잘못된 cookie 변경 origin과 큰 body를 service 전에 차단한다", async () => {
    expect((await POST(mutation("POST", {}, { cookie: "leesfield_session=test", origin: "https://foreign.example", host: "localhost" }))).status).toBe(403);
    expect(service.create).not.toHaveBeenCalled();
    const tooLarge = await POST(mutation("POST", { prompt: "x".repeat(100_000) }));
    expect(tooLarge.status).toBe(413);
    expect(service.create).not.toHaveBeenCalled();
  });
  it("body owner가 아닌 인증 owner로 저장하고 생성201을 반환한다", async () => {
    service.create.mockResolvedValue({ key: "new-preset" });
    const body = { key: "new-preset", prompt: "original" };
    expect((await POST(mutation("POST", body))).status).toBe(201);
    expect(service.create).toHaveBeenCalledWith("authenticated@example.com", body);
  });
  it("변경/복원/삭제의 revision을 전달하며 충돌과 누락을 구별한다", async () => {
    service.update.mockRejectedValue(new PromptPresetError("PRESET_CONFLICT", 409));
    expect((await PATCH(mutation("PATCH", { expectedRevision: 1 }), context)).status).toBe(409);
    expect(service.update).toHaveBeenCalledWith("authenticated@example.com", "character-sheet-creator", { expectedRevision: 1 });
    service.restore.mockResolvedValue({ revision: 3 });
    expect((await RESTORE(mutation("POST", { expectedRevision: 2 }), context)).status).toBe(200);
    service.remove.mockRejectedValue(new PromptPresetError("PRESET_NOT_FOUND", 404));
    expect((await DELETE(mutation("DELETE", { expectedRevision: 2 }), context)).status).toBe(404);
  });
});
