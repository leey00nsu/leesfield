import { Header } from "@/widgets/header/ui/header";
import { LoginForm } from "@/features/auth/login/ui/login-form";
import { getTranslations } from "next-intl/server";
import { AppBrandLogo } from "@/shared/ui/app-brand-logo";
type LoginScreenProps = { returnTo?: string };
export async function LoginScreen({ returnTo = "/" }: LoginScreenProps) {
  const t = await getTranslations("auth.login");
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header variant="public" />
      <main className="flex min-h-[calc(100svh-4rem)] flex-1 items-center">
        <section
          aria-label={t("panelLabel")}
          className="mx-auto grid w-full max-w-[72rem] gap-10 px-5 py-14 sm:px-7 sm:py-20 lg:grid-cols-[minmax(0,.9fr)_minmax(20rem,.58fr)] lg:items-center lg:px-8"
        >
          <div
            className="hidden min-h-[28rem] items-center justify-center lg:flex"
            aria-hidden="true"
          >
            <div className="flex flex-col items-center gap-6">
              <AppBrandLogo
                variant="icon"
                size="lg"
                markClassName="h-28 w-28"
              />
              <p className="text-sm text-muted-foreground">
                {t("platform")}
              </p>
            </div>
          </div>
          <div className="mx-auto flex w-full max-w-sm flex-col text-center lg:mx-0 lg:text-left">
            <AppBrandLogo size="sm" className="mx-auto lg:mx-0" />
            <h1 className="mt-3 break-keep text-balance text-[2rem] font-semibold leading-[1.08] tracking-[-0.05em] sm:text-[2.75rem] lg:text-5xl">
              {t("headline")}
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              {t("subtitle")}
            </p>
            <div className="mt-8 w-full">
              <LoginForm returnTo={returnTo} />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
