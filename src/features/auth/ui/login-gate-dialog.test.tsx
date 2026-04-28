import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginGateDialog } from "@/features/auth/ui/login-gate-dialog";
import { renderWithIntl } from "@/test-utils/intl";

describe("LoginGateDialog", () => {
  it("renders a creative studio auth gate with login and cancel actions", () => {
    const onOpenChange = vi.fn();

    renderWithIntl(
      <LoginGateDialog
        open
        onOpenChange={onOpenChange}
        title="로그인이 필요합니다"
        description="프롬프트를 이어가려면 로그인하세요."
        actionLabel="로그인"
        cancelLabel="나중에"
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "로그인이 필요합니다" }),
    ).toBeInTheDocument();
    expect(screen.getByText("LEESFIELD")).toBeInTheDocument();
    expect(screen.getByText("Creative workspace")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getAllByRole("button", { name: "나중에" })).toHaveLength(2);
  });
});
