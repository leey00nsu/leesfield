import { getTranslations } from "next-intl/server";
export default async function SpaceLoading() {
  const t = await getTranslations("routeState");
  return <div className="min-h-[60svh] grid place-items-center bg-neutral-900 text-sm text-neutral-400" role="status">{t("spaceLoading")}</div>;
}
