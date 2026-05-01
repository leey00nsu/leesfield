"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
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

interface ApiDocsSidebarProps {
  apiVersion: string;
  apiSections: ApiSection[];
}

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
  const endpointItems: ApiDocsNavItem[] = useMemo(() => {
    if (!apiSections.length) {
      return fallbackEndpointItems.map((item) => ({
        ...item,
        label: tNav(item.id),
      }));
    }
    return apiSections.map((section) => ({
      id: section.id,
      label: tagIdMap[section.title]
        ? tNav(tagIdMap[section.title])
        : section.title,
      icon: getEndpointIcon(section),
    }));
  }, [apiSections, tNav]);
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
    return endpointItems.filter(
      (item) =>
        item.label.toLowerCase().includes(normalizedQuery) ||
        item.id.toLowerCase().includes(normalizedQuery),
    );
  }, [endpointItems, normalizedQuery]);
  const sectionIds = useMemo(
    () => [...filteredGeneralItems, ...filteredEndpointItems].map((item) => item.id),
    [filteredEndpointItems, filteredGeneralItems],
  );
  const { activeSectionId } = useApiDocsNavigation({ sectionIds });

  return (
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
            containerClassName="h-11 rounded-xl border-white/10 bg-black/22"
            className="text-sm"
          />
        </div>
        <nav className="flex min-h-0 flex-col gap-6 overflow-y-auto pr-1">
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
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-primary/25 bg-primary/10 text-primary"
                        : "border-transparent text-white/48 hover:border-white/8 hover:bg-white/[0.035] hover:text-white"
                    }`}
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
                const isActive = activeSectionId === item.id;
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-primary/25 bg-primary/10 text-primary"
                        : "border-transparent text-white/48 hover:border-white/8 hover:bg-white/[0.035] hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">{item.label}</span>
                  </a>
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
  );
}
