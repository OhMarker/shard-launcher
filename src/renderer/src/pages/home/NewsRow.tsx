import { motion } from 'framer-motion'
import { ArrowUpRight, Newspaper, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { formatDate } from '@shared/format'
import { type NewsItem } from '@shared/types'
import { openExternal } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { SectionHeader } from '@/components/ui/Misc'
import { Skeleton } from '@/components/ui/Skeleton'
import { useNews } from './useHomeData'

const MAX_ITEMS = 8

function NewsCard({ item }: { item: NewsItem }) {
  const [broken, setBroken] = useState(false)
  const showImage = item.imageUrl !== null && !broken
  const clickable = item.readMoreUrl !== null
  return (
    <motion.button
      type="button"
      whileHover={clickable ? { y: -3 } : undefined}
      whileTap={clickable ? { scale: 0.985 } : undefined}
      onClick={() => {
        if (item.readMoreUrl) openExternal(item.readMoreUrl)
      }}
      disabled={!clickable}
      aria-label={clickable ? `${item.title} (opens in browser)` : item.title}
      className="glass group flex w-[260px] shrink-0 snap-start flex-col overflow-hidden rounded-[16px] text-left transition-[border-color] hover:border-line-strong disabled:cursor-default"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-white/5">
        {showImage ? (
          <img
            src={item.imageUrl ?? undefined}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
            className="size-full object-cover transition-transform duration-500 ease-[var(--ease-out-quint)] group-hover:scale-[1.04]"
          />
        ) : (
          <div
            className="size-full"
            style={{ background: 'linear-gradient(135deg, rgb(var(--accent-rgb) / 0.35), rgb(var(--accent-rgb) / 0.05))' }}
            aria-hidden
          />
        )}
        {item.category && (
          <Badge tone="neutral" size="sm" className="absolute left-2.5 top-2.5 bg-[#0b0f18]/80 backdrop-blur">
            {item.category}
          </Badge>
        )}
        {clickable && (
          <span className="absolute right-2.5 top-2.5 flex size-6 items-center justify-center rounded-full bg-[#0b0f18]/80 text-fg-muted opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <ArrowUpRight className="size-3.5" />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <div className="line-clamp-2 text-sm font-semibold leading-snug text-fg">{item.title}</div>
        <div className="mt-auto text-xs text-fg-subtle">{formatDate(item.date)}</div>
      </div>
    </motion.button>
  )
}

function NewsSkeleton() {
  return (
    <div className="glass w-[260px] shrink-0 overflow-hidden rounded-[16px]" aria-hidden>
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="space-y-2 p-3.5">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="mt-3 h-3 w-20" />
      </div>
    </div>
  )
}

/** Horizontal row of Minecraft news from launchercontent.mojang.com. */
export function NewsRow({ className }: { className?: string }) {
  const { data, isLoading, isError, refetch, isFetching } = useNews()
  const items = data?.slice(0, MAX_ITEMS) ?? []

  return (
    <section className={className} aria-labelledby="home-news">
      <SectionHeader
        title={<span id="home-news">News</span>}
        description="Latest from minecraft.net"
        action={
          <Button size="xs" variant="ghost" leftIcon={<RefreshCw className={cn(isFetching && 'animate-[spin_0.9s_linear_infinite]')} />} onClick={() => void refetch()} disabled={isFetching}>
            Refresh
          </Button>
        }
      />
      <div className="scroll-area mt-3 flex snap-x gap-4 overflow-x-auto overflow-y-hidden pb-3 [scrollbar-width:thin]">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <NewsSkeleton key={i} />)
        ) : isError && items.length === 0 ? (
          <EmptyState
            compact
            icon={<Newspaper />}
            title="News is unavailable right now"
            description="Minecraft news could not be loaded. It is not needed to play."
            action={
              <Button size="sm" variant="outline" onClick={() => void refetch()}>
                Try again
              </Button>
            }
            className="w-full"
          />
        ) : items.length === 0 ? (
          <EmptyState compact icon={<Newspaper />} title="No news yet" className="w-full" />
        ) : (
          items.map((item) => <NewsCard key={item.id} item={item} />)
        )}
      </div>
    </section>
  )
}
