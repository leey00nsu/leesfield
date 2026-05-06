"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import type { ApiSection } from "@/features/api-docs/model/openapi-helpers";
import { useApiDocsNavigation } from "@/widgets/api-docs/hook/use-api-docs-navigation";
import {
  fallbackEndpointItems,
  generalNavItems,
  getEndpointIcon,
  tagIdMap,
  type ApiDocsNavItem,
} from "@/widgets/api-docs/lib/api-docs-metadata";
import { AppCard } from "@/shared/ui/app-card";
import { AppSearchField } from "@/shared/ui/app-filter-toolbar";
import { cn } from "@/shared/lib/utils";

interface ApiDocsSidebarProps {
  apiVersion: string;
  apiSections: ApiSection[];
}

type EndpointNavSection = ApiDocsNavItem & {
  operations: Array<{
    id: string;
    method: string;
    path: string;
  }>;
};

export function ApiDocsSidebar({
  apiVersion,
  apiSections,
}: ApiDocsSidebarProps) {
  const t = useTranslations("apiDocs.sidebar");
  const tNav = useTranslations("apiDocs.sidebar.nav");
  const [searchQuery, setSearchQuery] = useState("");
  const generalItems: ApiDocsNavItem[] = useMemo(
    () =>
      generalNavItems.map((item) => ({
        ...item,
        label: tNav(item.id),
      })),
    [tNav],
  );
  const endpointItems: EndpointNavSection[] = useMemo(() => {
    if (!apiSections.length) {
      return fallbackEndpointItems.map((item) => ({
        ...item,
        label: tNav(item.id),
        operations: [],
      }));
    }
    return apiSections.map((section) => ({
      id: section.id,
      label: tagIdMap[section.title]
        ? tNav(tagIdMap[section.title])
        : section.title,
      icon: getEndpointIcon(section),
      operations: section.operations.map((operation) => ({
        id: operation.id,
        method: operation.method,
        path: operation.path,
      })),
    }));
  }, [apiSections, tNav]);
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredGeneralItems = useMemo(() => {
    if (!normalizedQuery) return generalItems;
    return generalItems.filter(
      (item) =>
        item.label.toLowerCase().includes(normalizedQuery) ||
        item.id.toLowerCase().includes(normalizedQuery),
    );
  }, [generalItems, normalizedQuery]);
  const filteredEndpointItems = useMemo(() => {
    if (!normalizedQuery) return endpointItems;
    return endpointItems
      .map((item) => {
        const sectionMatches =
          item.label.toLowerCase().includes(normalizedQuery) ||
          item.id.toLowerCase().includes(normalizedQuery);
        const operations = item.operations.filter(
          (operation) =>
            operation.path.toLowerCase().includes(normalizedQuery) ||
            operation.method.toLowerCase().includes(normalizedQuery),
        );
        return sectionMatches ? item : { ...item, operations };
      })
      .filter(
        (item) =>
          item.label.toLowerCase().includes(normalizedQuery) ||
          item.id.toLowerCase().includes(normalizedQuery) ||
          item.operations.length > 0,
      );
  }, [endpointItems, normalizedQuery]);
  const sectionIds = useMemo(
    () => [
      ...filteredGeneralItems.map((item) => item.id),
      ...filteredEndpointItems.flatMap((item) => [
        item.id,
        ...item.operations.map((operation) => operation.id),
      ]),
    ],
    [filteredEndpointItems, filteredGeneralItems],
  );
  const { activeSectionId } = useApiDocsNavigation({ sectionIds });
  const activeEndpointSectionId = useMemo(
    () =>
      filteredEndpointItems.find(
        (item) =>
          item.id === activeSectionId ||
          item.operations.some((operation) => operation.id === activeSectionId),
      )?.id ?? null,
    [activeSectionId, filteredEndpointItems],
  );

  const toggleSection = (sectionId: string) => {
    setCollapsedSectionIds((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  return (
    <>
      <AppCard
        variant="plain"
        className="flex rounded-[1.25rem] border-white/10 bg-[#0b0d0e] p-4 lg:hidden"
      >
        <div className="flex min-w-0 flex-col gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">
              {t("reference")}
            </div>
            <div className="mt-1 text-[11px] text-white/38">{apiVersion}</div>
          </div>
          <AppSearchField
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
          />
          <nav
            aria-label={t("reference")}
            className="app-scrollbar flex gap-2 overflow-x-auto pb-1"
          >
            {filteredGeneralItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSectionId === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={cn(
                    "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition-colors",
                    isActive
                      ? "border-primary/35 bg-primary/10 text-primary"
                      : "border-white/10 bg-black/16 text-white/58 hover:bg-white/[0.04] hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </a>
              );
            })}
            {filteredEndpointItems.flatMap((item) => {
              const Icon = item.icon;
              const isActive =
                activeSectionId === item.id ||
                item.operations.some(
                  (operation) => operation.id === activeSectionId,
                );
              return [
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={cn(
                    "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition-colors",
                    isActive
                      ? "border-primary/35 bg-primary/10 text-primary"
                      : "border-white/10 bg-black/16 text-white/58 hover:bg-white/[0.04] hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </a>,
                ...item.operations.map((operation) => (
                  <a
                    key={operation.id}
                    href={`#${operation.id}`}
                    className={cn(
                      "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3 font-mono text-xs transition-colors",
                      activeSectionId === operation.id
                        ? "border-primary/35 bg-primary/10 text-primary"
                        : "border-white/10 bg-black/16 text-white/50 hover:bg-white/[0.04] hover:text-white",
                    )}
                  >
                    <span className="font-bold uppercase">{operation.method}</span>
                    <span>{operation.path}</span>
                  </a>
                )),
              ];
            })}
            {!filteredGeneralItems.length && !filteredEndpointItems.length ? (
              <span className="inline-flex h-10 shrink-0 items-center rounded-full border border-white/10 px-3 text-sm text-white/36">
                {t("noResults")}
              </span>
            ) : null}
          </nav>
        </div>
      </AppCard>

      <aside className="hidden w-72 shrink-0 lg:flex">
      <AppCard
        variant="plain"
        className="sticky top-[calc(var(--dashboard-header-height,0px)+24px)] flex max-h-[calc(100vh-var(--dashboard-header-height,0px)-48px)] flex-col rounded-[1.25rem] border-white/10 bg-[#0b0d0e] p-4"
      >
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">
                {t("reference")}
              </div>
              <div className="mt-1 text-[11px] text-white/38">{apiVersion}</div>
            </div>
          </div>
          <AppSearchField
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
          />
        </div>
        <nav className="app-scrollbar flex min-h-0 flex-col gap-6 overflow-y-auto pr-1">
          <div className="flex flex-col gap-2">
            <h3 className="px-1 text-[10px] font-black uppercase tracking-[0.28em] text-white/36">
              {t("general")}
            </h3>
            <div className="flex flex-col gap-1">
              {filteredGeneralItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSectionId === item.id;
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "border-primary/25 bg-primary/10 text-primary"
                        : "border-transparent text-white/48 hover:border-white/8 hover:bg-white/[0.035] hover:text-white",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">{item.label}</span>
                  </a>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="px-1 text-[10px] font-black uppercase tracking-[0.28em] text-white/36">
              {t("endpoints")}
            </h3>
            <div className="flex flex-col gap-1">
              {filteredEndpointItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  activeSectionId === item.id ||
                  item.operations.some(
                    (operation) => operation.id === activeSectionId,
                  );
                const isExpanded =
                  normalizedQuery.length > 0 ||
                  activeEndpointSectionId === item.id ||
                  !collapsedSectionIds.has(item.id);
                return (
                  <div key={item.id} className="flex flex-col gap-1">
                    <div
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "border-primary/25 bg-primary/10 text-primary"
                          : "border-transparent text-white/60 hover:border-white/8 hover:bg-white/[0.035] hover:text-white",
                      )}
                    >
                      <a
                        href={`#${item.id}`}
                        className="flex min-w-0 flex-1 items-center gap-3"
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 truncate">{item.label}</span>
                      </a>
                      {item.operations.length ? (
                        <button
                          type="button"
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-current/70 transition-colors hover:bg-white/10 hover:text-white"
                          aria-label={item.label}
                          aria-expanded={isExpanded}
                          onClick={() => toggleSection(item.id)}
                        >
                          <ChevronDown
                            className={cn(
                              "h-3.5 w-3.5 transition-transform",
                              isExpanded && "rotate-180",
                            )}
                          />
                        </button>
                      ) : null}
                    </div>
                    {isExpanded && item.operations.length ? (
                      <div className="ml-6 flex flex-col gap-0.5 border-l border-white/8 pl-3">
                        {item.operations.map((operation) => {
                          const isOperationActive =
                            activeSectionId === operation.id;
                          return (
                            <a
                              key={operation.id}
                              href={`#${operation.id}`}
                              className={cn(
                                "grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors",
                                isOperationActive
                                  ? "bg-white/[0.07] text-primary"
                                  : "text-white/42 hover:bg-white/[0.035] hover:text-white/78",
                              )}
                            >
                              <span className="font-mono text-[10px] font-bold uppercase">
                                {operation.method}
                              </span>
                              <span className="min-w-0 truncate font-mono">
                                {operation.path}
                              </span>
                            </a>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {!filteredGeneralItems.length && !filteredEndpointItems.length ? (
                <div className="px-2 py-3 text-xs text-white/36">
                  {t("noResults")}
                </div>
              ) : null}
            </div>
          </div>
        </nav>
      </AppCard>
      </aside>
    </>
  );
}
