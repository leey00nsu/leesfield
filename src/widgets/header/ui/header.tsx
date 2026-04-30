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
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import { AppBrandLogo } from "@/shared/ui/app-brand-logo";
import { AppButton } from "@/shared/ui/app-button";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
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
    <header className="sticky top-0 z-30 flex shrink-0 items-center justify-between border-b border-white/10 bg-background-dark/80 px-6 py-3 backdrop-blur-md">
      <Link href="/" className="flex items-center gap-3">
        <AppBrandLogo
          label={tBrand("name")}
          size="sm"
          priority
          textClassName="text-lg leading-tight"
        />
      </Link>

      <nav className="hidden items-center gap-1 rounded-full border border-white/5 bg-surface-dark p-1 lg:flex">
        {dashboardNavigation.map((item) => {
          const Icon = headerIcons[item.href] ?? ImageIcon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={tNav(item.key)}
              className="flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium text-gray-400 transition-all hover:bg-white/5 hover:text-white xl:px-4"
            >
              <Icon className="h-4 w-4" />
              <span className="hidden xl:inline">{tNav(item.key)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="lg:hidden text-gray-200 hover:bg-white/10 hover:text-white"
              aria-label={tHeader("menu")}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-64 border-white/10 bg-background-dark text-white"
          >
            <DropdownMenuLabel className="font-display text-white">
              {tBrand("name")}
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/10" />
            {isAuthenticated ? (
              <>
                {dashboardNavigation.map((item) => {
                  const Icon = headerIcons[item.href] ?? ImageIcon;

                  return (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link
                        href={item.href}
                        className="flex items-center gap-3 text-sm text-gray-200"
                      >
                        <Icon className="h-4 w-4 text-primary" />
                        {tNav(item.key)}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem asChild>
                  <Link
                    href="/profile"
                    className="flex items-center gap-3 text-sm text-gray-200"
                  >
                    <User className="h-4 w-4 text-primary" />
                    {tHeader("profile")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem asChild>
                  <form action={logoutAction} className="w-full">
                    <Button
                      type="submit"
                      variant="ghost"
                      className="w-full justify-start gap-3 text-left text-sm text-gray-200 hover:bg-white/10 hover:text-white"
                    >
                      <LogOut className="h-4 w-4" />
                      {tHeader("logout")}
                    </Button>
                  </form>
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem asChild>
                <Link
                  href="/login"
                  className="flex items-center gap-3 text-sm text-gray-200"
                >
                  <LogIn className="h-4 w-4 text-primary" />
                  {tHeader("login")}
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <LanguageSwitcher />
        {isAuthenticated ? (
          <Link href="/profile" className="flex items-center">
            <Avatar className="size-9 ring-2 ring-white/10 transition-all hover:ring-primary">
              {userAvatarUrl ? (
                <AvatarImage
                  src={userAvatarUrl}
                  alt={userEmail ?? tCommonLabels("user")}
                />
              ) : null}
              <AvatarFallback className="flex items-center justify-center bg-surface-lighter text-[10px] font-bold text-white">
                {initials || <User className="h-4 w-4" />}
              </AvatarFallback>
            </Avatar>
          </Link>
        ) : (
          <Link href="/login" className="flex items-center">
            <Avatar className="size-9 ring-2 ring-white/10 transition-all hover:ring-primary">
              <AvatarFallback className="flex items-center justify-center bg-surface-lighter text-[10px] font-bold text-white">
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
          </Link>
        )}
        {isAuthenticated ? (
          <form action={logoutAction} className="hidden lg:flex">
            <Button
              type="submit"
              variant="outline"
              className="h-10 gap-2 rounded-full border-white/10 bg-surface-lighter px-5 text-sm font-bold text-white ring-2 ring-white/10 transition-all hover:border-primary/50 hover:bg-white/5 hover:ring-primary"
            >
              <LogOut className="h-4 w-4 text-primary" />
              {tHeader("logout")}
            </Button>
          </form>
        ) : (
          <Button
            asChild
            variant="outline"
            className="hidden h-10 gap-2 rounded-full border-white/10 bg-surface-lighter px-5 text-sm font-bold text-white ring-2 ring-white/10 transition-all hover:border-primary/50 hover:bg-white/5 hover:ring-primary lg:flex"
          >
            <Link href="/login">
              <LogIn className="h-4 w-4 text-primary" />
              {tHeader("login")}
            </Link>
          </Button>
        )}
      </div>
    </header>
  );
}
