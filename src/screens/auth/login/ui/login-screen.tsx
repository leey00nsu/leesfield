import { Header } from "@/widgets/header/ui/header";
import { LoginForm } from "@/features/auth/login/ui/login-form";

export function LoginScreen() {
  return (
    <div className="flex min-h-screen flex-col bg-background-dark font-display text-white">
      <Header variant="public" />

      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="sticky top-0 z-20 border-b border-white/5 bg-background-dark/95 px-6 py-6 backdrop-blur-xl sm:px-10">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-6">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <h1 className="text-3xl font-black uppercase tracking-[-0.033em] sm:text-5xl">
                  <span className="text-white">User</span>{" "}
                  <span className="text-primary">Login</span>
                </h1>
                <p className="mt-2 flex items-center gap-2 text-xs font-mono tracking-wide text-gray-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  AUTHENTICATION REQUIRED // SECURE ACCESS
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 pb-20 pt-6 sm:px-10">
          <LoginForm />
        </div>
      </main>
    </div>
  );
}
