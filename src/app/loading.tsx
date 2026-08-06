import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level fallback. Mirrors the listing layout rather than showing a
 * spinner, so the page does not jump when the real content arrives.
 */
export default function Loading() {
  return (
    <div className="container-shell py-16" aria-busy aria-live="polite">
      <span className="sr-only">Loading</span>

      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-8 h-12 w-full max-w-md" />
      <Skeleton className="mt-4 h-4 w-full max-w-xl" />

      <div className="mt-16 grid gap-x-12 lg:grid-cols-[16rem_1fr] xl:gap-x-20">
        <div className="hidden space-y-4 lg:block">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>

        <ul className="grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-5 lg:grid-cols-3 lg:gap-x-8">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i} className="space-y-4">
              <Skeleton className="aspect-3/4 w-full" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
