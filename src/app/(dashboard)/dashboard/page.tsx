import { getTranslations } from "next-intl/server";

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  return (
    <div className="max-w-xl">
      <div className="rounded-2xl border border-white/10 bg-surface-dark p-8">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-sm text-gray-400">
          {t("description")}
        </p>
      </div>
    </div>
  );
}
