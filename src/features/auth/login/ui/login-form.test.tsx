import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/features/auth/login/ui/login-form";

const mockLoginAction = vi.fn(async () => ({ error: "테스트 오류" }));

vi.mock("@/features/auth/login/api/login-action", () => ({
  loginAction: mockLoginAction,
}));

describe("LoginForm", () => {
  it("필수 입력값이 비어 있으면 오류 메시지를 표시한다", async () => {
    const user = userEvent.setup();

    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: /authenticate/i }));

    expect(
      screen.getByText("올바른 이메일을 입력해주세요."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("비밀번호를 입력해주세요."),
    ).toBeInTheDocument();
  });

  it("로그인 실패 시 서버 오류 메시지를 표시한다", async () => {
    const user = userEvent.setup();

    render(<LoginForm />);

    await user.type(
      screen.getByPlaceholderText("ENTER_ID..."),
      "admin@example.com",
    );
    await user.type(screen.getByPlaceholderText("••••••••"), "secret");

    await user.click(screen.getByRole("button", { name: /authenticate/i }));

    expect(await screen.findByText("테스트 오류")).toBeInTheDocument();
  });
});
