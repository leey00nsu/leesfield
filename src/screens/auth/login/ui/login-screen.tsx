import Link from "next/link";
import { LoginForm } from "@/features/auth/login/ui/login-form";
import { getTranslations } from "next-intl/server";
import { AppBrandLogo } from "@/shared/ui/app-brand-logo";
import { LoginVisual } from "./login-visual";

type LoginScreenProps = { returnTo?: string };

export async function LoginScreen({ returnTo = "/" }: LoginScreenProps) {
  const t = await getTranslations("auth.login");
  return (
    <main className="min-h-svh bg-background p-5 sm:p-8 lg:p-10">
      <section
        aria-label={t("panelLabel")}
        className="mx-auto grid min-h-[calc(100svh-2.5rem)] w-full max-w-[1600px] items-stretch gap-10 sm:min-h-[calc(100svh-4rem)] lg:min-h-[calc(100svh-5rem)] lg:grid-cols-2 lg:gap-16"
      >
        <div className="flex items-center justify-center py-12 sm:px-6 lg:py-16">
          <div className="w-full max-w-md text-left">
            <Link href="/" className="inline-flex rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
              <AppBrandLogo size="sm" />
            </Link>
            <h1 className="mt-8 break-keep text-balance text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-5xl">
              {t("headline")}
            </h1>
            <p className="mt-5 text-sm leading-7 text-muted-foreground sm:text-base">
              {t("subtitle")}
            </p>
            <div className="mt-10">
              <LoginForm returnTo={returnTo} />
            </div>
          </div>
        </div>
        <div className="relative hidden min-h-[36rem] overflow-hidden rounded-3xl bg-card lg:block" aria-hidden="true">
          <LoginVisual />
        </div>
      </section>
    </main>
  );
}
