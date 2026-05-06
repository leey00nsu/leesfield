import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/features/auth/login/ui/login-form";
import { renderWithIntl } from "@/test-utils/intl";

const mockLoginAction = vi.hoisted(() =>
  vi.fn(async () => ({ errorCode: "INVALID_CREDENTIALS" })),
);

vi.mock("@/features/auth/login/api/login-action", () => ({
  loginAction: mockLoginAction,
}));

describe("LoginForm", () => {
  beforeEach(() => {
    mockLoginAction.mockClear();
  });

  it("필수 입력값이 비어 있으면 오류 메시지를 표시한다", async () => {
    const user = userEvent.setup();

    renderWithIntl(<LoginForm returnTo="/image?prompt=studio" />);

    await user.click(screen.getByRole("button", { name: "로그인" }));

    expect(
      screen.getByText("올바른 이메일을 입력해주세요."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("비밀번호를 입력해주세요."),
    ).toBeInTheDocument();
  });

  it("로그인 실패 시 서버 오류 메시지를 표시한다", async () => {
    const user = userEvent.setup();

    renderWithIntl(<LoginForm returnTo="/image?prompt=studio" />);

    await user.type(
      screen.getByPlaceholderText("아이디 입력..."),
      "admin@example.com",
    );
    await user.type(screen.getByPlaceholderText("••••••••"), "secret");

    await user.click(screen.getByRole("button", { name: "로그인" }));

    const submittedData = (
      mockLoginAction.mock.calls as unknown as Array<[unknown, FormData]>
    )[0]?.[1];
    expect(submittedData.get("returnTo")).toBe("/image?prompt=studio");
    expect(
      await screen.findByText("이메일 또는 비밀번호가 올바르지 않습니다."),
    ).toBeInTheDocument();
  });
});
