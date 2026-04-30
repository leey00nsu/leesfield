import { beforeEach, describe, expect, it, vi } from "vitest";
import ModelManagementPage from "@/app/(public)/model/page";

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

vi.mock("@/screens/model-management/ui/model-management-screen", () => ({
  ModelManagementScreen: () => <div data-testid="model-screen" />,
}));

describe("ModelManagementPage", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.redirect.mockClear();
  });

  it("비로그인 상태에서는 로그인으로 리다이렉트한다", async () => {
    mocks.getSession.mockResolvedValue({
      isLoggedIn: false,
      adminEmail: null,
    });

    await expect(ModelManagementPage()).rejects.toThrow("redirect");

    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("로그인 상태에서는 public layout 아래에서 model screen을 렌더링한다", async () => {
    mocks.getSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });

    const result = await ModelManagementPage();

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });
});
