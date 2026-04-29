import { useTranslations } from "next-intl";
import { LogoCloud } from "@/shared/ui/logo-cloud";

const logos = [
  { label: "Next.js" },
  { label: "React" },
  { label: "TypeScript" },
  { label: "Tailwind" },
  { label: "Prisma" },
  { label: "PostgreSQL" },
  { label: "Vitest" },
  { label: "shadcn/ui" },
];

export function LandingTechLogoCloudSection() {
  const t = useTranslations("landing.techCloud");

  return (
    <section className="relative overflow-hidden px-6 py-16 sm:px-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -z-0 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.08),transparent_58%)] blur-3xl"
      />

      <div className="relative mx-auto max-w-4xl">
        <h2 className="mb-5 text-center text-xl font-semibold tracking-tight text-white md:text-3xl">
          {t("title")}
        </h2>
        <div className="mx-auto my-5 h-px max-w-sm bg-white/10 [mask-image:linear-gradient(to_right,transparent,black,transparent)]" />
        <LogoCloud logos={logos} />
        <div className="mt-5 h-px bg-white/10 [mask-image:linear-gradient(to_right,transparent,black,transparent)]" />
      </div>
    </section>
  );
}
