import { beforeEach, describe, expect, it, vi } from "vitest";
import ProtectedLayout from "@/app/(protected)/layout";

const mockGetSession = vi.fn();
const mockRedirect = vi.fn(() => {
  throw new Error("redirect");
});

vi.mock("@/server/auth/session", () => ({
  getSession: mockGetSession,
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

describe("ProtectedLayout", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockRedirect.mockClear();
  });

  it("비로그인 상태에서는 로그인으로 리다이렉트한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: false,
      adminEmail: null,
    });

    await expect(
      ProtectedLayout({ children: <div>child</div> }),
    ).rejects.toThrow("redirect");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("로그인 상태에서는 레이아웃을 렌더링한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });

    const result = await ProtectedLayout({ children: <div>child</div> });

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });
});
