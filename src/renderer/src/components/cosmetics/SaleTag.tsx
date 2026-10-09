import { cn } from '@/lib/cn'

/** "-20%" pill on items that are on sale. */
export function SaleTag({ badge, className }: { badge: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-full border border-danger/40 bg-danger/90 px-2 text-[11px] font-bold leading-none text-white shadow-[0_0_12px_rgb(244_63_94/0.45)]',
        className
      )}
      aria-label={`On sale, ${badge.replace('-', '')} off`}
    >
      {badge}
    </span>
  )
}
