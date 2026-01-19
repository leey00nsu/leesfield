"use client";

import { Check, Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { localeCookie, locales } from "@/shared/i18n/config";
import { localeLabels } from "@/shared/i18n/locale-labels";
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

  const handleSelect = (nextLocale: string) => {
    if (nextLocale === locale) return;
    document.cookie = `${localeCookie}=${nextLocale}; path=/; max-age=${COOKIE_MAX_AGE}`;
    router.replace(pathname);
    router.refresh();
  };

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
            <span>{localeLabels[option]}</span>
            {locale === option ? (
              <Check className="h-4 w-4 text-primary" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
