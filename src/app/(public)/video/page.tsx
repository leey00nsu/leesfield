import { redirect } from "next/navigation";
import { generationHref } from "@/shared/lib/generation/routes";
export default async function VideoGenerationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(generationHref("video", await searchParams));
}
