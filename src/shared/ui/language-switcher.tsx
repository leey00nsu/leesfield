"use client";

import { useEffect, useState } from "react";
import { Check, Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { localeCookie, locales } from "@/shared/i18n/config";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("header");
  const tLocales = useTranslations("common.locales");
  const [pendingLocale, setPendingLocale] = useState<string | null>(null);

  const handleSelect = (nextLocale: string) => {
    if (nextLocale === locale) return;
    setPendingLocale(nextLocale);
  };

  useEffect(() => {
    if (!pendingLocale || pendingLocale === locale) return;
    document.cookie = `${localeCookie}=${pendingLocale}; path=/; max-age=${COOKIE_MAX_AGE}`;
    router.replace(pathname);
    router.refresh();
  }, [locale, pathname, pendingLocale, router]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-gray-200 hover:bg-white/10 hover:text-white"
          aria-label={t("language")}
        >
          <Globe className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-44 border-white/10 bg-background-dark text-white"
      >
        <DropdownMenuLabel className="font-display text-white">
          {t("language")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/10" />
        {locales.map((option) => (
          <DropdownMenuItem
            key={option}
            onClick={() => handleSelect(option)}
            className="flex items-center justify-between text-sm text-gray-200"
          >
            <span>{tLocales(option)}</span>
            {locale === option ? (
              <Check className="h-4 w-4 text-primary" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
