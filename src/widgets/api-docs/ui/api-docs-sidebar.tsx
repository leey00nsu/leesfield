"use client";

import { useMemo } from "react";
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
import { AppBadge } from "@/shared/ui/app-badge";
import { AppCard } from "@/shared/ui/app-card";

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
  const sectionIds = useMemo(
    () => [...generalItems, ...endpointItems].map((item) => item.id),
    [generalItems, endpointItems],
  );
  const { activeSectionId } = useApiDocsNavigation({ sectionIds });

  return (
    <aside className="hidden w-72 shrink-0 lg:flex">
      <AppCard
        variant="editorial-flat"
        className="sticky top-[calc(var(--dashboard-header-height,0px)+24px)] flex max-h-[calc(100vh-var(--dashboard-header-height,0px)-48px)] flex-col rounded-[1.35rem] border-white/12 p-5"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <AppBadge variant="primary" className="px-2.5 py-1">
            {t("label", { version: apiVersion })}
          </AppBadge>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/38">
            API
          </span>
        </div>
        <nav className="flex min-h-0 flex-col gap-7 overflow-y-auto pr-1">
          <div className="flex flex-col gap-2">
            <h3 className="px-1 text-[10px] font-black uppercase tracking-[0.28em] text-white/42">
              {t("general")}
            </h3>
            <div className="flex flex-col gap-1">
              {generalItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSectionId === item.id;
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-primary/20 bg-primary/10 text-primary"
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
            <h3 className="px-1 text-[10px] font-black uppercase tracking-[0.28em] text-white/42">
              {t("endpoints")}
            </h3>
            <div className="flex flex-col gap-1">
              {endpointItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSectionId === item.id;
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-primary/20 bg-primary/10 text-primary"
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
        </nav>
      </AppCard>
    </aside>
  );
}
