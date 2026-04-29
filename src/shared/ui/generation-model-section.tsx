"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import type { GenerationModality } from "@/shared/generation/generation-presets";
import { resolveModelOutcomeMetadata } from "@/shared/generation/model-outcome-metadata";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

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
  activeId: T;
  onSelect: (id: T) => void;
  className?: string;
}

export function GenerationModelSection<T extends string>({
  modality,
  title,
  action,
  items,
  activeId,
  onSelect,
  className,
}: GenerationModelSectionProps<T>) {
  const t = useTranslations("generation");
  const tModel = useTranslations("model");
  const tOutcome = useTranslations("model.outcome");
  const tPicker = useTranslations("generation.modelPicker");
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const resolvedTitle = title ?? t("modelSelect");
  const activeModel = items.find((model) => model.id === activeId) ?? items[0];
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return items;

    return items.filter((model) => {
      const outcome = resolveModelOutcomeMetadata({
        key: model.id,
        type: modality,
        modalities: model.modalities,
      });
      return [
        model.id,
        model.name,
        model.vendor,
        tOutcome(`profiles.${outcome.profile}.bestFor`),
        tOutcome(`profiles.${outcome.profile}.style`),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [items, modality, query, tOutcome]);
  const featuredItems = filteredItems.slice(0, Math.min(6, filteredItems.length));
  const featuredIds = new Set(featuredItems.map((model) => model.id));
  const allItems = filteredItems.filter((model) => !featuredIds.has(model.id));
  const renderBadge = (model: GenerationModelOption<T>, index: number) => {
    const normalized = `${model.id} ${model.name}`.toLowerCase();
    const label =
      normalized.includes("gpt") ||
      normalized.includes("pro") ||
      normalized.includes("premium")
        ? tPicker("premium")
        : index < 3
          ? tPicker("new")
          : null;
    if (!label) return null;

    return (
      <span className="rounded px-1.5 py-0.5 text-[9px] font-black italic uppercase leading-none text-black bg-primary">
        {label}
      </span>
    );
  };

  const renderModelRow = (
    model: GenerationModelOption<T>,
    index: number,
    scope: "featured" | "all",
  ) => {
    const outcome = resolveModelOutcomeMetadata({
      key: model.id,
      type: modality,
      modalities: model.modalities,
    });
    const isActive = activeId === model.id;

    return (
      <Button
        key={`${scope}-${model.id}`}
        type="button"
        onClick={() => {
          onSelect(model.id);
          setIsOpen(false);
          setQuery("");
        }}
        variant="ghost"
        className={cn(
          "h-auto w-full justify-start rounded-xl px-3 py-2.5 text-left hover:bg-white/[0.06]",
          isActive && "bg-white/[0.07]",
        )}
      >
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-black/18 text-sm font-semibold text-gray-300",
            isActive && "text-primary",
          )}
          aria-hidden="true"
        >
          {model.vendor?.[0] ?? model.name[0]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-sm font-bold text-white">
              {model.name}
            </span>
            {renderBadge(model, index)}
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-gray-500">
            {tOutcome(`profiles.${outcome.profile}.bestFor`)}
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-gray-500">
            {tOutcome(`profiles.${outcome.profile}.style`)}
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase text-gray-500">
              {tOutcome("labels.technical")}
            </span>
            <span className="text-[10px] font-mono text-gray-600">
              {model.vendor}
            </span>
            <span className="text-[10px] font-mono text-gray-600">
              {model.id}
            </span>
          </span>
          <span className="mt-2 flex flex-wrap gap-1.5">
            {outcome.tags.map((tag) => (
              <span
                key={`${scope}-${model.id}-${tag}`}
                className="rounded-md border border-white/10 bg-black/25 px-1.5 py-0.5 text-[9px] font-mono uppercase text-gray-300"
                title={tModel(`modality.${tag.toLowerCase()}` as const)}
              >
                {tag}
              </span>
            ))}
          </span>
        </span>
        {isActive ? (
          <span className="ml-auto flex items-center gap-1 text-xs font-bold text-primary">
            <Check className="h-4 w-4" />
            {tPicker("selected")}
          </span>
        ) : null}
      </Button>
    );
  };

  return (
    <div className={cn("relative", className)}>
      <Button
        type="button"
        variant="surface"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
        className={cn(
          "h-12 rounded-xl border-white/12 bg-black/16 px-3 text-white hover:border-primary/45 hover:bg-black/24",
          activeModel && "border-primary",
        )}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
          {activeModel?.vendor?.[0] ?? activeModel?.name?.[0] ?? "M"}
        </span>
        <span className="max-w-[13rem] truncate font-medium">
          {activeModel?.name ?? resolvedTitle}
        </span>
        <ChevronDown className="h-4 w-4 text-primary" />
      </Button>

      {isOpen ? (
        <div
          role="dialog"
          aria-label={typeof resolvedTitle === "string" ? resolvedTitle : t("modelSelect")}
          className="absolute bottom-full left-0 z-50 mb-3 flex max-h-[min(70vh,44rem)] w-[min(92vw,34rem)] flex-col overflow-hidden rounded-[1.35rem] border border-white/12 bg-[#171b1f]/95 shadow-[0_24px_90px_rgba(0,0,0,0.58)] backdrop-blur-xl"
        >
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
              <h3 className="flex items-center gap-2 px-1 text-sm font-bold text-gray-400">
                <Sparkles className="h-4 w-4" />
                {tPicker("featured")}
              </h3>
              {featuredItems.length > 0 ? (
                featuredItems.map((model, index) =>
                  renderModelRow(model, index, "featured"),
                )
              ) : (
                <p className="px-1 text-sm text-gray-500">{tPicker("empty")}</p>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="px-1 text-sm font-bold text-gray-400">
                {tPicker("all")}
              </h3>
              {allItems.length > 0 ? (
                allItems.map((model, index) =>
                  renderModelRow(model, index, "all"),
                )
              ) : (
                <p className="px-1 text-sm text-gray-500">{tPicker("empty")}</p>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
