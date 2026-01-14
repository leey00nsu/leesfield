import type { ApiDocsNavItem } from "@/widgets/api-docs/lib/api-docs-metadata";

interface ApiDocsSidebarProps {
  apiVersion: string;
  generalItems: ApiDocsNavItem[];
  endpointItems: ApiDocsNavItem[];
  activeSectionId: string;
}

export function ApiDocsSidebar({
  apiVersion,
  generalItems,
  endpointItems,
  activeSectionId,
}: ApiDocsSidebarProps) {
  return (
    <aside className="hidden lg:flex w-72 shrink-0 flex-col border-r border-white/10 pr-6">
      <div className="sticky top-[calc(var(--dashboard-header-height,0px)+24px)] flex flex-col gap-6">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400 font-mono">
          <span className="h-2 w-2 rounded-full bg-primary" />
          API 레퍼런스 {apiVersion}
        </div>
        <nav className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h3 className="px-2 text-xs font-bold uppercase tracking-wider text-white">
              일반
            </h3>
            <div className="flex flex-col gap-1">
              {generalItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSectionId === item.id;
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "border border-primary/10 bg-primary/10 text-primary"
                        : "text-gray-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </a>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="px-2 text-xs font-bold uppercase tracking-wider text-white">
              엔드포인트
            </h3>
            <div className="flex flex-col gap-1">
              {endpointItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSectionId === item.id;
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "border border-primary/10 bg-primary/10 text-primary"
                        : "text-gray-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </a>
                );
              })}
            </div>
          </div>
        </nav>
      </div>
    </aside>
  );
}
