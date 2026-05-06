import Link from "next/link";
import { AppButton } from "@/shared/ui/app-button";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#07090b] px-6 text-white">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="text-sm font-black uppercase tracking-[0.32em] text-white">
          PAGE NOT FOUND
        </div>
        <AppButton asChild className="rounded-full px-7">
          <Link href="/">GO HOME</Link>
        </AppButton>
      </div>
    </main>
  );
}
