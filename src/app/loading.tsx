import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#07090b] text-white">
      <Loader2
        role="status"
        aria-label="Loading"
        className="h-8 w-8 animate-spin text-primary"
      />
    </main>
  );
}
