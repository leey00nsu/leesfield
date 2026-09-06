"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import type { GenerationModality } from "@/shared/generation/generation-presets";
import { cn } from "@/shared/lib/utils";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppPopover,
  AppPopoverContent,
  AppPopoverTrigger,
} from "@/shared/ui/app-popover";

interface GenerationModelOption<T extends string> {
  id: T;
  name: string;
  vendor: string;
  modalities?: string[];
}

interface GenerationModelSectionProps<T extends string> {
  modality: GenerationModality;
  title?: ReactNode;
  action?: ReactNode;
  items: ReadonlyArray<GenerationModelOption<T>>;
  activeId: T | null;
  selectionLabel?: ReactNode;
  defaultId?: T;
  onSelect: (id: T) => void;
  className?: string;
  disabled?: boolean;
}

export function GenerationModelSection<T extends string>({
  title,
  action,
  items,
  activeId,
  selectionLabel,
  defaultId,
  onSelect,
  className,
  disabled = false,
}: GenerationModelSectionProps<T>) {
  const t = useTranslations("generation");
  const tPicker = useTranslations("generation.modelPicker");
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setQuery("");
    }
  };
  const resolvedTitle = title ?? t("modelSelect");
  const activeModel = activeId
    ? items.find((model) => model.id === activeId)
    : undefined;
  const defaultModelId = defaultId ?? items[0]?.id;
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return items;

    return items.filter((model) => {
      return [model.id, model.name, model.vendor]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [items, query]);
  const featuredItems = filteredItems.slice(
    0,
    Math.min(6, filteredItems.length),
  );
  const featuredIds = new Set(featuredItems.map((model) => model.id));
  const allItems = filteredItems.filter((model) => !featuredIds.has(model.id));
  const renderDefaultBadge = (model: GenerationModelOption<T>) => {
    if (model.id !== defaultModelId) return null;

    return (
      <span className="rounded bg-primary px-1.5 py-0.5 text-[9px] font-black uppercase leading-none text-black">
        {tPicker("default")}
      </span>
    );
  };

  const renderModelRow = (
    model: GenerationModelOption<T>,
    scope: "featured" | "all",
  ) => {
    const isActive = activeId === model.id;

    return (
      <AppButton
        key={`${scope}-${model.id}`}
        type="button"
        onClick={() => {
          onSelect(model.id);
          setIsOpen(false);
          setQuery("");
        }}
        variant="ghost"
        className={cn(
          "h-auto min-h-12 w-full justify-start rounded-xl px-3 py-2.5 text-left hover:bg-white/[0.06]",
          isActive && "bg-data-accent/15 ring-1 ring-inset ring-data-accent/40 hover:bg-data-accent/25",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-sm font-bold text-white">
              {model.name}
            </span>
            {renderDefaultBadge(model)}
          </span>
        </span>
        {isActive ? (
          <span
            className="ml-auto flex items-center gap-1 text-xs font-bold text-data-accent-foreground"
            aria-label={tPicker("selected")}
          >
            <Check className="h-4 w-4" />
          </span>
        ) : null}
      </AppButton>
    );
  };

  return (
    <AppPopover open={isOpen} onOpenChange={handleOpenChange}>
      <div className={cn("relative", className)}>
        <AppPopoverTrigger asChild>
          <AppButton
            type="button"
            variant="surface"
            size="md"
            disabled={disabled}
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            className={cn(
              "min-w-0 justify-between",
              activeModel && "border-primary",
            )}
          >
            <span className="min-w-0 flex flex-col items-start leading-tight">
              <span className="sr-only">{resolvedTitle}</span>
              <span className="max-w-[13rem] truncate font-medium">
                {selectionLabel ?? activeModel?.name ?? resolvedTitle}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 text-primary" />
          </AppButton>
        </AppPopoverTrigger>
      </div>

      <AppPopoverContent
        side="top"
        align="start"
        sideOffset={12}
        role="dialog"
        aria-label={
          typeof resolvedTitle === "string" ? resolvedTitle : t("modelSelect")
        }
        className="flex max-h-[min(70vh,44rem)] w-[min(92vw,34rem)] flex-col overflow-hidden p-0"
      >
        <div className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
            <Search className="h-5 w-5 text-gray-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tPicker("searchPlaceholder")}
              className="h-10 flex-1 border-none bg-transparent text-lg text-white outline-none placeholder:text-gray-500"
            />
            {action}
          </div>

          <div className="flex min-h-0 flex-col gap-5 overflow-y-auto p-4">
            <section className="flex flex-col gap-2">
              <h3 className="px-1 text-sm font-bold text-gray-400">
                {tPicker("featured")}
              </h3>
              {featuredItems.length > 0 ? (
                featuredItems.map((model) => renderModelRow(model, "featured"))
              ) : (
                <p className="px-1 text-sm text-gray-500">{tPicker("empty")}</p>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="px-1 text-sm font-bold text-gray-400">
                {tPicker("all")}
              </h3>
              {allItems.length > 0 ? (
                allItems.map((model) => renderModelRow(model, "all"))
              ) : (
                <p className="px-1 text-sm text-gray-500">{tPicker("empty")}</p>
              )}
            </section>
          </div>
        </div>
      </AppPopoverContent>
    </AppPopover>
  );
}
