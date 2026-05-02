"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  BookOpen,
  Boxes,
  Clapperboard,
  History,
  Image as ImageIcon,
  AudioLines,
  KeyRound,
  Activity,
  LogIn,
  Menu,
  LogOut,
  User,
} from "lucide-react";
import { logoutAction } from "@/features/auth/logout/api/logout-action";
import { dashboardNavigation } from "@/shared/config/navigation";
import {
  AppAvatar,
  AppAvatarFallback,
  AppAvatarImage,
} from "@/shared/ui/app-avatar";
import { AppBrandLogo } from "@/shared/ui/app-brand-logo";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuLabel,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from "@/shared/ui/app-dropdown-menu";
import { LanguageSwitcher } from "@/shared/ui/language-switcher";

type HeaderProps = {
  variant?: "public" | "dashboard";
  isAuthenticated?: boolean;
  userEmail?: string | null;
  userAvatarUrl?: string | null;
};

const headerIcons: Record<string, typeof ImageIcon> = {
  "/image": ImageIcon,
  "/video": Clapperboard,
  "/audio": AudioLines,
  "/history": History,
  "/monitoring": Activity,
  "/model": Boxes,
  "/api-key": KeyRound,
  "/api-docs": BookOpen,
};

function getInitials(email?: string | null) {
  if (!email) return "";
  const namePart = email.split("@")[0]?.trim();
  if (!namePart) return "";
  const segments = namePart.split(/[._-]+/).filter(Boolean);
  if (segments.length >= 2) {
    return `${segments[0][0] ?? ""}${segments[1][0] ?? ""}`.toUpperCase();
  }
  return namePart.slice(0, 2).toUpperCase();
}

export function Header({
  variant = "dashboard",
  isAuthenticated = false,
  userEmail = null,
  userAvatarUrl,
}: HeaderProps) {
  const initials = getInitials(userEmail);
  const tHeader = useTranslations("header");
  const tBrand = useTranslations("common.brand");
  const tNav = useTranslations("nav");
  const tCommonLabels = useTranslations("common.labels");
  const publicNav = dashboardNavigation.filter((item) =>
    ["/image", "/video", "/audio", "/history", "/model", "/monitoring", "/api-docs"].includes(
      item.href,
    ),
  );

  if (variant === "public") {
    return (
      <header className="relative z-30 mx-auto flex w-full max-w-[1600px] items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/" className="flex items-center gap-3">
          <AppBrandLogo label={tBrand("name")} priority />
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {publicNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-white/78 transition-colors hover:text-white"
            >
              {tNav(item.key)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <Link
            href={isAuthenticated ? "/profile" : "/login"}
            className="hidden text-sm font-medium text-white/78 transition-colors hover:text-white sm:inline-flex"
          >
            {isAuthenticated ? tHeader("profile") : tHeader("login")}
          </Link>
          <AppButton
            asChild
            size="md"
            className="h-11 rounded-full px-6 text-sm normal-case tracking-normal"
          >
            <Link href={isAuthenticated ? "/image" : "/login"}>
              {tHeader("dashboard")}
            </Link>
          </AppButton>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-30 flex shrink-0 items-center justify-between bg-background-dark/78 px-6 py-5 backdrop-blur-md sm:px-10">
      <Link href="/" className="flex items-center gap-3">
        <AppBrandLogo
          label={tBrand("name")}
          size="sm"
          priority
          textClassName="text-xl leading-tight"
        />
      </Link>

      <nav className="hidden items-center gap-8 lg:flex">
        {publicNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-label={tNav(item.key)}
            className="text-sm font-medium text-white/72 transition-colors hover:text-white"
          >
            <span className="hidden xl:inline">{tNav(item.key)}</span>
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <AppDropdownMenu>
          <AppDropdownMenuTrigger asChild>
            <AppButton
              type="button"
              variant="ghost"
              size="icon"
              className="lg:hidden text-gray-200 hover:bg-white/10 hover:text-white"
              aria-label={tHeader("menu")}
            >
              <Menu className="h-5 w-5" />
            </AppButton>
          </AppDropdownMenuTrigger>
          <AppDropdownMenuContent
            align="start"
            className="w-64 border-white/10 bg-background-dark text-white"
          >
            <AppDropdownMenuLabel className="font-display text-white">
              {tBrand("name")}
            </AppDropdownMenuLabel>
            <AppDropdownMenuSeparator className="bg-white/10" />
            {isAuthenticated ? (
              <>
                {dashboardNavigation.map((item) => {
                  const Icon = headerIcons[item.href] ?? ImageIcon;

                  return (
                    <AppDropdownMenuItem key={item.href} asChild>
                      <Link
                        href={item.href}
                        className="flex items-center gap-3 text-sm text-gray-200"
                      >
                        <Icon className="h-4 w-4 text-primary" />
                        {tNav(item.key)}
                      </Link>
                    </AppDropdownMenuItem>
                  );
                })}
                <AppDropdownMenuSeparator className="bg-white/10" />
                <AppDropdownMenuItem asChild>
                  <Link
                    href="/profile"
                    className="flex items-center gap-3 text-sm text-gray-200"
                  >
                    <User className="h-4 w-4 text-primary" />
                    {tHeader("profile")}
                  </Link>
                </AppDropdownMenuItem>
                <AppDropdownMenuSeparator className="bg-white/10" />
                <AppDropdownMenuItem asChild>
                  <form action={logoutAction} className="w-full">
                    <AppButton
                      type="submit"
                      variant="ghost"
                      className="w-full justify-start gap-3 text-left text-sm text-gray-200 hover:bg-white/10 hover:text-white"
                    >
                      <LogOut className="h-4 w-4" />
                      {tHeader("logout")}
                    </AppButton>
                  </form>
                </AppDropdownMenuItem>
              </>
            ) : (
              <AppDropdownMenuItem asChild>
                <Link
                  href="/login"
                  className="flex items-center gap-3 text-sm text-gray-200"
                >
                  <LogIn className="h-4 w-4 text-primary" />
                  {tHeader("login")}
                </Link>
              </AppDropdownMenuItem>
            )}
          </AppDropdownMenuContent>
        </AppDropdownMenu>
        <LanguageSwitcher />
        {isAuthenticated ? (
          <Link href="/profile" className="flex items-center">
            <AppAvatar className="size-9 ring-2 ring-white/10 transition-all hover:ring-primary">
              {userAvatarUrl ? (
                <AppAvatarImage
                  src={userAvatarUrl}
                  alt={userEmail ?? tCommonLabels("user")}
                />
              ) : null}
              <AppAvatarFallback className="flex items-center justify-center bg-surface-lighter text-[10px] font-bold text-white">
                {initials || <User className="h-4 w-4" />}
              </AppAvatarFallback>
            </AppAvatar>
          </Link>
        ) : (
          <Link href="/login" className="flex items-center">
            <AppAvatar className="size-9 ring-2 ring-white/10 transition-all hover:ring-primary">
              <AppAvatarFallback className="flex items-center justify-center bg-surface-lighter text-[10px] font-bold text-white">
                <User className="h-4 w-4" />
              </AppAvatarFallback>
            </AppAvatar>
          </Link>
        )}
        {isAuthenticated ? (
          <form action={logoutAction} className="hidden lg:flex">
            <AppButton
              type="submit"
              variant="surface"
              className="h-10 gap-2 rounded-full border-white/10 bg-surface-lighter px-5 text-sm font-bold text-white ring-2 ring-white/10 transition-all hover:border-primary/50 hover:bg-white/5 hover:ring-primary"
            >
              <LogOut className="h-4 w-4 text-primary" />
              {tHeader("logout")}
            </AppButton>
          </form>
        ) : (
          <AppButton
            asChild
            variant="surface"
            className="hidden h-10 gap-2 rounded-full border-white/10 bg-surface-lighter px-5 text-sm font-bold text-white ring-2 ring-white/10 transition-all hover:border-primary/50 hover:bg-white/5 hover:ring-primary lg:flex"
          >
            <Link href="/login">
              <LogIn className="h-4 w-4 text-primary" />
              {tHeader("login")}
            </Link>
          </AppButton>
        )}
      </div>
    </header>
  );
}
