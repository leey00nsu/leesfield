import { getTranslations } from "next-intl/server";
import { Loader2 } from "lucide-react";

export default async function Loading() {
  const t = await getTranslations("routeState");
  return (
    <main className="grid min-h-screen place-items-center bg-[#07090b] text-white">
      <Loader2
        role="status"
        aria-label={t("loading")}
        className="h-8 w-8 animate-spin text-primary"
      />
    </main>
  );
}
