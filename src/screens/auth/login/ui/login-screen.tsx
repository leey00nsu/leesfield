import Image from "next/image";
import { Header } from "@/widgets/header/ui/header";
import { LoginForm } from "@/features/auth/login/ui/login-form";
import { getTranslations } from "next-intl/server";

export async function LoginScreen() {
  const tLogin = await getTranslations("auth.login");
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#07090b] text-white">
      <div className="pointer-events-none absolute inset-0">
        <Image
          src="/assets/creative-studio/blue-mosaic.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-10 blur-sm"
        />
        <div className="absolute inset-0 bg-[#07090b]/82" />
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_50%_0%,rgba(205,255,0,0.12),transparent_60%)]" />
      </div>
      <Header variant="public" />

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-10 sm:px-8 lg:px-10">
        <section
          aria-label={tLogin("panelLabel")}
          className="grid w-full min-w-0 max-w-[22.375rem] grid-cols-[minmax(0,1fr)] overflow-hidden rounded-[2rem] border border-white/10 bg-[#121619]/95 shadow-[0_28px_130px_rgba(0,0,0,0.58)] backdrop-blur-xl sm:max-w-[calc(100vw-4rem)] lg:max-w-6xl lg:grid-cols-[minmax(0,0.95fr)_minmax(22rem,1.05fr)]"
        >
          <div className="flex min-h-[38rem] min-w-0 overflow-hidden flex-col justify-center px-6 py-8 sm:px-10 lg:px-14">
            <div className="mx-auto flex w-full min-w-0 max-w-[19.5rem] flex-col items-center text-center sm:max-w-md">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-black shadow-[0_0_34px_rgba(205,255,0,0.25)]">
                <Image src="/logo.webp" alt="" width={32} height={32} />
              </div>
              <h1 className="lf-serif max-w-full text-3xl text-white sm:text-4xl">
                {tLogin("headline")}
              </h1>
              <p className="mt-3 w-full max-w-full whitespace-normal break-words text-sm leading-6 text-gray-400 sm:max-w-sm">
                {tLogin("subtitle")}
              </p>

              <div className="mt-10 w-full">
                <LoginForm />
              </div>

              <p className="mt-10 w-full max-w-full whitespace-normal break-words text-xs leading-5 text-gray-600 sm:max-w-sm">
                {tLogin("terms")}
              </p>
            </div>
          </div>

          <div className="relative hidden min-h-[38rem] overflow-hidden border-l border-white/10 lg:block">
            <Image
              src="/assets/creative-studio/mirror-portrait.jpg"
              alt={tLogin("preview.imageAlt")}
              fill
              priority
              sizes="(min-width: 1024px) 44rem, 0vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.76),transparent_48%),linear-gradient(to_right,rgba(18,22,25,0.18),transparent_42%)]" />
            <div className="absolute bottom-6 left-6 right-6">
              <div className="mb-4 flex flex-wrap gap-2">
                <span className="rounded-lg bg-primary px-3 py-1.5 text-xs font-black text-black">
                  {tLogin("preview.badges.unlimited")}
                </span>
                <span className="rounded-lg bg-black/45 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-md">
                  {tLogin("preview.badges.quality")}
                </span>
                <span className="rounded-lg bg-black/45 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-md">
                  {tLogin("preview.badges.prompt")}
                </span>
              </div>
              <h2 className="lf-serif text-4xl leading-none text-white">
                {tLogin("preview.title")}
              </h2>
              <p className="mt-3 text-sm text-gray-300">
                {tLogin("preview.description")}
              </p>
              <div
                aria-hidden="true"
                className="mt-8 grid grid-cols-4 gap-1.5 text-xs font-semibold text-gray-500"
              >
                <span className="h-1 rounded-full bg-white" />
                <span className="h-1 rounded-full bg-white/80" />
                <span className="h-1 rounded-full bg-white/30" />
                <span className="h-1 rounded-full bg-white/15" />
                <span>{tLogin("preview.tabs.image")}</span>
                <span>{tLogin("preview.tabs.video")}</span>
                <span>{tLogin("preview.tabs.audio")}</span>
                <span>{tLogin("preview.tabs.api")}</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
