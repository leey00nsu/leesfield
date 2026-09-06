import { redirect } from "next/navigation";
import { generationHref } from "@/shared/lib/generation/routes";
export default async function ImageGenerationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(generationHref("image", await searchParams));
}
