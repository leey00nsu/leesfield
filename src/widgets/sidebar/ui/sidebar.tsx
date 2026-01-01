import Link from "next/link";
import { dashboardNavigation } from "@/shared/config/navigation";

export function Sidebar() {
  return (
    <aside className="hidden w-64 border-r border-neutral-900 bg-neutral-950 px-5 py-8 text-neutral-200 lg:block">
      <div className="mb-8 text-lg font-semibold">Leesfield</div>
      <nav className="space-y-1 text-sm">
        {dashboardNavigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-lg px-3 py-2 text-neutral-400 transition hover:bg-neutral-900 hover:text-neutral-100"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
