import { getTranslations } from "next-intl/server";
export default async function SpaceLoading() {
  const t = await getTranslations("routeState");
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-neutral-900 text-sm text-neutral-400" role="status">{t("spaceLoading")}</div>;
}
