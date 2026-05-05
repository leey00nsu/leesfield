import Link from "next/link";
import { AppBrandLogo } from "@/shared/ui/app-brand-logo";
import { AppCard } from "@/shared/ui/app-card";

const groups = [
  {
    title: "Product",
    links: [
      ["Image", "/image"],
      ["Video", "/video"],
      ["Audio", "/audio"],
      ["History", "/history"],
    ],
  },
  {
    title: "Platform",
    links: [
      ["Models", "/model"],
      ["Monitoring", "/monitoring"],
      ["API Docs", "/api-docs"],
      ["API Keys", "/api-key"],
    ],
  },
  {
    title: "Social",
    links: [
      ["X", "https://x.com"],
      ["GitHub", "https://github.com"],
      ["Discord", "https://discord.com"],
      ["LinkedIn", "https://linkedin.com"],
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="px-6 pb-12 pt-8 sm:px-10">
      <AppCard variant="editorial" className="mx-auto max-w-[1500px] rounded-[1.6rem] p-8 md:p-14">
        <div className="grid gap-12 md:grid-cols-[1fr_0.46fr_0.46fr_0.46fr]">
          <Link href="/" className="flex items-center gap-3 self-start">
            <AppBrandLogo size="lg" textClassName="text-2xl" />
          </Link>
          {groups.map((group) => (
            <div key={group.title}>
              <h2 className="text-sm uppercase tracking-[0.16em] text-white/44">
                {group.title}
              </h2>
              <ul className="mt-7 space-y-5">
                {group.links.map(([label, href]) => (
                  <li key={label}>
                    <Link
                      href={href}
                      className="text-lg text-white/82 transition-colors hover:text-white"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-24 border-t border-white/12 pt-8 text-sm text-white/48">
          © 2026 leesfield. All rights reserved.
        </div>
      </AppCard>
    </footer>
  );
}
