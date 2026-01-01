import { logoutAction } from "@/server/auth/actions";

export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-neutral-900 bg-neutral-950 px-6 py-4">
      <div className="text-sm font-medium text-neutral-200">
        개인 AI 생성 대시보드
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-200 transition hover:border-neutral-500 hover:text-white"
        >
          로그아웃
        </button>
      </form>
    </header>
  );
}
