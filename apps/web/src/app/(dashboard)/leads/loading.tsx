import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton loader da lista de leads (Story 8.8 — AC 8.8.9). Exibido pelo Next.js
 * durante o fetch do Server Component da página.
 */
export default function LeadsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Skeleton className="mb-6 h-7 w-32" />

      <div className="mb-6 flex flex-wrap gap-3">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-24" />
      </div>

      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  )
}
