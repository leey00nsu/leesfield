"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Boxes,
  Clapperboard,
  History,
  Image as ImageIcon,
  KeyRound,
  LogOut,
  Plus,
  User,
} from "lucide-react";
import { logoutAction } from "@/features/auth/logout/api/logout-action";
import { dashboardNavigation } from "@/shared/config/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";

type HeaderProps = {
  variant?: "public" | "dashboard";
};

const headerIcons: Record<string, typeof ImageIcon> = {
  "/image": ImageIcon,
  "/video": Clapperboard,
  "/history": History,
  "/model": Boxes,
  "/api-key": KeyRound,
  "/profile": User,
};

export function Header({ variant = "dashboard" }: HeaderProps) {
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

      <nav className="hidden items-center gap-1 rounded-full border border-white/5 bg-surface-dark p-1 md:flex">
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
        <Button
          type="button"
          variant="outline"
          className="hidden h-10 gap-2 rounded-full border-white/10 bg-surface-lighter px-4 text-xs font-bold text-white hover:border-primary/50 hover:bg-white/5 sm:flex"
        >
          <Plus className="h-4 w-4 text-primary" />
          New Canvas
        </Button>
        <Avatar className="size-9 ring-2 ring-white/10">
          <AvatarImage src="/logo.webp" alt="user" />
          <AvatarFallback className="bg-surface-lighter text-[10px] font-bold text-white">
            LF
          </AvatarFallback>
        </Avatar>
        {variant === "dashboard" && (
          <form action={logoutAction}>
            <Button
              type="submit"
              variant="outline"
              className="h-9 gap-2 rounded-full border-white/10 px-3 text-xs font-medium text-gray-200 hover:border-primary/50 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              로그아웃
            </Button>
          </form>
        )}
      </div>
    </header>
  );
}
