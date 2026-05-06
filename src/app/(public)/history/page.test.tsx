import { beforeEach, describe, expect, it, vi } from "vitest";
import GenerationHistoryPage from "@/app/(public)/history/page";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
}));

vi.mock("@/server/auth/session", () => ({
  getSession: mocks.getSession,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/screens/generation-history/ui/generation-history-screen", () => ({
  GenerationHistoryScreen: () => <div data-testid="history-screen" />,
}));

describe("GenerationHistoryPage", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.redirect.mockClear();
  });

  it("비로그인 상태에서는 로그인으로 리다이렉트한다", async () => {
    mocks.getSession.mockResolvedValue({
      isLoggedIn: false,
      adminEmail: null,
    });

    await expect(GenerationHistoryPage()).rejects.toThrow("redirect");

    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("로그인 상태에서는 public layout 아래에서 history screen을 렌더링한다", async () => {
    mocks.getSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });

    const result = await GenerationHistoryPage();

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });
});
