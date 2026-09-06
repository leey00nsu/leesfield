"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Menu, UserRound, KeyRound, LogOut } from "lucide-react";
import { logoutAction } from "@/features/auth/logout/api/logout-action";
import { dashboardNavigation } from "@/shared/config/navigation";
import { AppBrandLogo } from "@/shared/ui/app-brand-logo";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  AppDropdownMenuLabel,
  AppDropdownMenuSeparator,
} from "@/shared/ui/app-dropdown-menu";
import { LanguageSwitcher } from "@/shared/ui/language-switcher";
type HeaderProps = {
  variant?: "public" | "dashboard";
  isAuthenticated?: boolean;
  userEmail?: string | null;
};
export function Header({ isAuthenticated = false, userEmail }: HeaderProps) {
  const t = useTranslations("header"),
    nav = useTranslations("nav"),
    brand = useTranslations("common.brand");
  const pathname = usePathname();
  const BrandLogo = AppBrandLogo;
  const items = dashboardNavigation.filter(
    (item) => item.href !== "/spaces" || isAuthenticated,
  );
  return (
    <header className="relative z-30 mx-auto flex w-full max-w-[1600px] items-center justify-between gap-3 px-4 py-5 sm:px-8">
      <Link href="/" aria-label={brand("name")}>
        <BrandLogo label={brand("name")} size="sm" priority />
      </Link>
      <nav aria-label={t("menu")} className="hidden items-center gap-6 lg:flex">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname === item.href ? "page" : undefined}
            className="relative text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-foreground after:absolute after:inset-x-1/4 after:-bottom-2 after:h-0.5 after:rounded-full after:bg-data-accent after:opacity-0 aria-[current=page]:after:opacity-100"
          >
            {nav(item.key)}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-1 sm:gap-2">
        <AppDropdownMenu>
          <AppDropdownMenuTrigger asChild>
            <AppButton
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label={t("menu")}
            >
              <Menu />
            </AppButton>
          </AppDropdownMenuTrigger>
          <AppDropdownMenuContent align="end" className="w-52">
            {items.map((item) => (
              <AppDropdownMenuItem key={item.href} asChild>
                <Link href={item.href}>{nav(item.key)}</Link>
              </AppDropdownMenuItem>
            ))}
          </AppDropdownMenuContent>
        </AppDropdownMenu>
        <LanguageSwitcher />
        {isAuthenticated ? (
          <AppDropdownMenu>
            <AppDropdownMenuTrigger asChild>
              <AppButton
                variant="surface"
                size="icon"
                aria-label={userEmail ?? t("account")}
              >
                <UserRound />
              </AppButton>
            </AppDropdownMenuTrigger>
            <AppDropdownMenuContent align="end" className="w-60">
              <AppDropdownMenuLabel>
                {userEmail ?? brand("name")}
              </AppDropdownMenuLabel>
              <AppDropdownMenuItem asChild>
                <Link href="/api-key">
                  <KeyRound />
                  {nav("apiKey")}
                </Link>
              </AppDropdownMenuItem>
              <AppDropdownMenuSeparator />
              <form action={logoutAction}>
                <AppButton
                  type="submit"
                  variant="ghost"
                  className="w-full justify-start"
                >
                  <LogOut />
                  {t("logout")}
                </AppButton>
              </form>
            </AppDropdownMenuContent>
          </AppDropdownMenu>
        ) : (
          <AppButton asChild>
            <Link href="/login">{t("login")}</Link>
          </AppButton>
        )}
      </div>
    </header>
  );
}
