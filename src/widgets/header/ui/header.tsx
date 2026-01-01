"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Boxes,
  Clapperboard,
  History,
  Image as ImageIcon,
  KeyRound,
  LogIn,
  Menu,
  LogOut,
  User,
} from "lucide-react";
import { logoutAction } from "@/features/auth/logout/api/logout-action";
import { dashboardNavigation } from "@/shared/config/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

type HeaderProps = {
  variant?: "public" | "dashboard";
  isAuthenticated?: boolean;
  userEmail?: string | null;
  userAvatarUrl?: string | null;
};

const headerIcons: Record<string, typeof ImageIcon> = {
  "/image": ImageIcon,
  "/video": Clapperboard,
  "/history": History,
  "/model": Boxes,
  "/api-key": KeyRound,
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

  return (
    <header className="z-30 flex shrink-0 items-center justify-between border-b border-white/10 bg-background-dark/80 px-6 py-3 backdrop-blur-md">
      <Link href="/" className="flex items-center gap-3">
        <Image
          src="/logo.webp"
          alt="leesfield"
          width={36}
          height={36}
          className="h-9 w-auto object-contain"
          priority
        />
        <h2 className="font-display text-lg font-bold leading-tight tracking-[-0.015em] text-white">
          leesfield
        </h2>
      </Link>

      <nav className="hidden items-center gap-1 rounded-full border border-white/5 bg-surface-dark p-1 lg:flex">
        {dashboardNavigation.map((item) => {
          const Icon = headerIcons[item.href] ?? ImageIcon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-gray-400 transition-all hover:bg-white/5 hover:text-white"
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-3">
        {variant === "dashboard" && isAuthenticated && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="lg:hidden text-gray-200 hover:bg-white/10 hover:text-white"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-64 border-white/10 bg-background-dark text-white"
            >
              <DropdownMenuLabel className="font-display text-white">
                leesfield
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/10" />
              {dashboardNavigation.map((item) => {
                const Icon = headerIcons[item.href] ?? ImageIcon;

                return (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 text-sm text-gray-200"
                    >
                      <Icon className="h-4 w-4 text-primary" />
                      {item.label}
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
                  프로필
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem asChild>
                <form action={logoutAction} className="w-full">
                  <button
                    type="submit"
                    className="flex w-full items-center gap-3 text-left text-sm text-gray-200"
                  >
                    <LogOut className="h-4 w-4" />
                    로그아웃
                  </button>
                </form>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {isAuthenticated ? (
          <Link href="/profile" className="flex items-center">
            <Avatar className="size-9 ring-2 ring-white/10 transition-all hover:ring-primary">
              {userAvatarUrl ? (
                <AvatarImage src={userAvatarUrl} alt={userEmail ?? "user"} />
              ) : null}
              <AvatarFallback className="flex items-center justify-center bg-surface-lighter text-[10px] font-bold text-white">
                {initials || <User className="h-4 w-4" />}
              </AvatarFallback>
            </Avatar>
          </Link>
        ) : (
          <Button
            asChild
            variant="outline"
            className="h-10 gap-2 rounded-full border-white/10 bg-surface-lighter px-5 text-sm font-bold text-white ring-2 ring-white/10 transition-all hover:border-primary/50 hover:bg-white/5 hover:ring-primary"
          >
            <Link href="/login">
              <LogIn className="h-4 w-4 text-primary" />
              로그인
            </Link>
          </Button>
        )}
        {variant === "dashboard" && isAuthenticated && (
          <form action={logoutAction} className="hidden lg:flex">
            <Button
              type="submit"
              variant="outline"
              className="h-10 gap-2 rounded-full border-white/10 bg-surface-lighter px-5 text-sm font-bold text-white ring-2 ring-white/10 transition-all hover:border-primary/50 hover:bg-white/5 hover:ring-primary"
            >
              <LogOut className="h-4 w-4 text-primary" />
              로그아웃
            </Button>
          </form>
        )}
      </div>
    </header>
  );
}
