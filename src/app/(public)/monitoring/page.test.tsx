import { beforeEach, describe, expect, it, vi } from "vitest";
import MonitoringDashboardPage from "@/app/(public)/monitoring/page";

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

vi.mock("@/screens/monitoring-dashboard/ui/monitoring-dashboard-screen", () => ({
  MonitoringDashboardScreen: () => <div data-testid="monitoring-screen" />,
}));

describe("MonitoringDashboardPage", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.redirect.mockClear();
  });

  it("비로그인 상태에서는 로그인으로 리다이렉트한다", async () => {
    mocks.getSession.mockResolvedValue({
      isLoggedIn: false,
      adminEmail: null,
    });

    await expect(MonitoringDashboardPage()).rejects.toThrow("redirect");

    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("로그인 상태에서는 public layout 아래에서 monitoring screen을 렌더링한다", async () => {
    mocks.getSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });

    const result = await MonitoringDashboardPage();

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });
});
