import { redirect } from "next/navigation";
import { GenerationHistoryScreen } from "@/screens/generation-history/ui/generation-history-screen";
import { getSession } from "@/server/auth/session";

export default async function GenerationHistoryPage({ searchParams }: { searchParams?: Promise<Record<string,string|string[]|undefined>> } = {}) {
  const session = await getSession();

  if (!session.isLoggedIn) {
    redirect("/login");
  }

  const params = await searchParams;
  const id = typeof params?.historyId === "string" ? params.historyId : "";
  const type = params?.type;
  const historyLink = id && ["image","video","audio"].includes(String(type)) ? { id, type: type as "image" | "video" | "audio", origin: params?.origin === "edit" ? "edit" as const : "generation" as const } : undefined;
  return <GenerationHistoryScreen historyLink={historyLink} />;
}
