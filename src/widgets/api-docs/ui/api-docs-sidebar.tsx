"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Menu, X } from "lucide-react";
import type { ApiSection } from "@/features/api-docs/model/openapi-helpers";
import { useApiDocsNavigation } from "@/widgets/api-docs/hook/use-api-docs-navigation";
import { generalNavItems, getEndpointIcon, tagIdMap } from "@/widgets/api-docs/lib/api-docs-metadata";
import { AppButton } from "@/shared/ui/app-button";
import { AppSearchField } from "@/shared/ui/app-filter-toolbar";
import { cn } from "@/shared/lib/utils";

interface ApiDocsSidebarProps {
  apiVersion: string;
  apiSections: ApiSection[];
}

export function ApiDocsSidebar({ apiVersion, apiSections }: ApiDocsSidebarProps) {
  const t = useTranslations("apiDocs.sidebar");
  const tNav = useTranslations("apiDocs.sidebar.nav");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<string>>(() => new Set());
  const menuButton = useRef<HTMLButtonElement>(null);
  const generalItems = generalNavItems.map((item) => ({ ...item, label: tNav(item.id) }));
  const endpointItems = apiSections.map((section) => ({
    ...section,
    label: tagIdMap[section.title] ? tNav(tagIdMap[section.title]) : section.title,
    icon: getEndpointIcon(section),
  }));
  // Search filters navigation without changing the current document position.
  const sectionIds = useMemo(() => [
    ...generalNavItems.map((item) => item.id),
    ...apiSections.flatMap((section) => [section.id, ...section.operations.map((operation) => operation.id)]),
  ], [apiSections]);
  const { activeSectionId } = useApiDocsNavigation({ sectionIds, offset: 96 });
  const query = searchQuery.trim().toLowerCase();
  const filteredGeneral = generalItems.filter((item) => !query || item.label.toLowerCase().includes(query) || item.id.includes(query));
  const filteredEndpoints = endpointItems.map((item) => ({
    ...item,
    operations: !query || item.label.toLowerCase().includes(query) || item.id.includes(query)
      ? item.operations
      : item.operations.filter((operation) => `${operation.method} ${operation.path}`.toLowerCase().includes(query)),
  })).filter((item) => item.operations.length);

  const closeMenu = () => {
    setMobileNavOpen(false);
    menuButton.current?.focus({ preventScroll: true });
  };
  const toggleSection = (id: string) => {
    setCollapsedSectionIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const linkClass = (active: boolean) => cn(
    "flex min-h-9 items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
    active ? "bg-data-accent/10 text-data-accent-foreground" : "text-muted-foreground hover:bg-interaction-hover hover:text-foreground",
  );
  const navigation = (mobile: boolean) => (
    <nav aria-label={t("reference")} className="app-scrollbar min-h-0 overflow-y-auto overscroll-contain">
      <div className="space-y-6 pb-6">
        {filteredGeneral.length ? (
          <div>
            <p className="mb-2 px-2.5 text-xs font-semibold text-muted-foreground">{t("general")}</p>
            {filteredGeneral.map((item) => (
              <a key={item.id} href={`#${item.id}`} aria-current={activeSectionId === item.id ? "location" : undefined}
                className={linkClass(activeSectionId === item.id)} onClick={mobile ? closeMenu : undefined}>
                {item.label}
              </a>
            ))}
          </div>
        ) : null}
        {filteredEndpoints.length ? (
          <div className="space-y-3">
            <p className="px-2.5 text-xs font-semibold text-muted-foreground">{t("endpoints")}</p>
            {filteredEndpoints.map((item) => {
              const expanded = Boolean(query) || !collapsedSectionIds.has(item.id);
              const groupId = `api-docs-${mobile ? "mobile" : "desktop"}-${item.id}`;
              const Icon = item.icon;
              return (
                <div key={item.id}>
                  <div className="flex items-center gap-1">
                    <a href={`#${item.id}`} onClick={mobile ? closeMenu : undefined}
                      aria-current={activeSectionId === item.id ? "location" : undefined}
                      className={cn(linkClass(activeSectionId === item.id), "min-w-0 flex-1 font-medium text-foreground")}>
                      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{item.label}</span>
                    </a>
                    <AppButton type="button" variant="ghost" size="icon-sm"
                      aria-label={item.label} aria-expanded={expanded} aria-controls={groupId}
                      onClick={() => toggleSection(item.id)}>
                      <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", !expanded && "-rotate-90")} />
                    </AppButton>
                  </div>
                  {expanded ? (
                    <div id={groupId} className="ml-4 space-y-0.5 border-l border-border pl-2">
                      {item.operations.map((operation) => (
                        <a key={operation.id} href={`#${operation.id}`} title={`${operation.method} ${operation.path}`}
                          aria-label={`${operation.method} ${operation.path}`}
                          aria-current={activeSectionId === operation.id ? "location" : undefined}
                          onClick={mobile ? closeMenu : undefined}
                          className={cn(linkClass(activeSectionId === operation.id), "grid grid-cols-[2.75rem_minmax(0,1fr)] text-xs")}>
                          <span className="text-[10px] font-semibold">{operation.method}</span>
                          <span className="truncate font-mono">{operation.path.replace("/api/external", "") || "/"}</span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        {!filteredGeneral.length && !filteredEndpoints.length ? (
          <p role="status" className="px-2.5 py-3 text-sm text-muted-foreground">{t("noResults")}</p>
        ) : null}
      </div>
    </nav>
  );
  const search = (id: string) => (
    <AppSearchField id={id} aria-label={t("searchPlaceholder")} value={searchQuery}
      onChange={(event) => setSearchQuery(event.target.value)} placeholder={t("searchPlaceholder")} />
  );

  return (
    <>
      <div className="sticky top-0 z-20 border-b border-border bg-background lg:hidden"
        onKeyDown={(event) => { if (event.key === "Escape") closeMenu(); }}>
        <div className="flex items-center justify-between gap-4 px-5 py-3 sm:px-10">
          <span className="text-sm font-medium">{t("reference")} <span className="ml-2 text-xs text-muted-foreground">{apiVersion}</span></span>
          <AppButton ref={menuButton} type="button" variant="surface" size="icon-sm"
            aria-label={t("reference")} aria-expanded={mobileNavOpen} aria-controls="api-docs-mobile-navigation"
            onClick={() => setMobileNavOpen((open) => !open)}>
            {mobileNavOpen ? <X aria-hidden className="size-4" /> : <Menu aria-hidden className="size-4" />}
          </AppButton>
        </div>
        {mobileNavOpen ? (
          <div id="api-docs-mobile-navigation" className="grid max-h-[calc(100dvh-4rem)] grid-rows-[auto_minmax(0,1fr)] gap-4 px-5 pt-2 sm:px-10">
            {search("api-docs-mobile-search")}
            {navigation(true)}
          </div>
        ) : null}
      </div>
      <aside className="sticky top-0 hidden h-dvh min-h-0 flex-col gap-6 self-start border-r border-border px-5 py-8 lg:flex">
        <div className="flex items-center justify-between gap-3 px-2.5">
          <span className="text-sm font-semibold">{t("reference")}</span>
          <span className="text-xs text-muted-foreground">{apiVersion}</span>
        </div>
        {search("api-docs-desktop-search")}
        {navigation(false)}
      </aside>
    </>
  );
}
