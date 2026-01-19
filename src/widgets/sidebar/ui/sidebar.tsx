import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { dashboardNavigation } from "@/shared/config/navigation";

export async function Sidebar() {
  const tNav = await getTranslations("nav");

  return (
    <aside className="hidden w-64 border-r border-white/10 bg-surface-dark px-5 py-8 text-white lg:block">
      <div className="mb-8 text-lg font-semibold">Leesfield</div>
      <nav className="space-y-1 text-sm">
        {dashboardNavigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-lg px-3 py-2 text-gray-400 transition hover:bg-white/5 hover:text-white"
          >
            {tNav(item.key)}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
