import { AppSkeleton } from "@/shared/ui/app-skeleton";
export function ResourceListLoading({ label }: { label: string }) {
  return <div role="status" aria-label={label} className="w-full overflow-hidden rounded-lg border border-border">
    {Array.from({ length: 4 }, (_, index) => <div key={index} aria-hidden="true" className="flex h-24 items-center gap-4 border-b border-border px-4 last:border-b-0">
      <AppSkeleton className="size-10 shrink-0 rounded-md" />
      <div className="flex-1 space-y-2"><AppSkeleton className="h-4 w-2/5 max-w-60" /><AppSkeleton className="h-3 w-3/5 max-w-80" /></div>
      <AppSkeleton className="hidden h-7 w-20 rounded-md sm:block" />
    </div>)}
  </div>;
}
