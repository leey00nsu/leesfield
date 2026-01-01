"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Boxes,
  History,
  LogOut,
  Palette,
  Plus,
  Settings,
} from "lucide-react";
import { logoutAction } from "@/server/auth/actions";

type HeaderProps = {
  variant?: "public" | "dashboard";
};

const headerNavigation = [
  { label: "Canvas", href: "/image-generation", icon: Palette },
  { label: "History", href: "/generation-history", icon: History },
  { label: "Models", href: "/model-management", icon: Boxes },
  { label: "Settings", href: "/profile", icon: Settings },
];

export function Header({ variant = "dashboard" }: HeaderProps) {
  return (
    <header className="z-30 flex shrink-0 items-center justify-between border-b border-white/10 bg-background-dark/80 px-6 py-3 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-full bg-surface-lighter ring-2 ring-white/10">
          <Image
            src="/logo.webp"
            alt="leesfield"
            width={28}
            height={28}
            className="size-7 object-contain"
            priority
          />
        </div>
        <h2 className="font-display text-lg font-bold leading-tight tracking-[-0.015em] text-white">
          leesfield
        </h2>
      </div>

      <nav className="hidden items-center gap-1 rounded-full border border-white/5 bg-surface-dark p-1 md:flex">
        {headerNavigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-gray-400 transition-all hover:bg-white/5 hover:text-white"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <button className="hidden h-10 items-center justify-center gap-2 rounded-full border border-white/10 bg-surface-lighter px-4 text-xs font-bold text-white transition-all hover:border-primary/50 hover:bg-white/5 sm:flex">
          <Plus className="h-4 w-4 text-primary" />
          New Canvas
        </button>
        <div className="relative">
          <div className="size-9 rounded-full bg-gradient-to-br from-primary/60 via-white/10 to-accent-purple/60 ring-2 ring-white/10" />
        </div>
        {variant === "dashboard" && (
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex h-9 items-center gap-2 rounded-full border border-white/10 px-3 text-xs font-medium text-gray-200 transition hover:border-primary/50 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              로그아웃
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
