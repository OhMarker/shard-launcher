import { cn } from '@/lib/cn'

/** The faceted crystal shard mark. Colors follow the current accent. */
export function ShardMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="shard-f1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="var(--accent)" />
        </linearGradient>
        <linearGradient id="shard-f2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="shard-f3" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.6" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <g transform="translate(32 32) rotate(-12) translate(-32 -32)">
        <polygon points="32,6 23,23 26,50 32,58" fill="url(#shard-f2)" />
        <polygon points="32,6 26,50 32,58 32,37" fill="var(--accent)" opacity="0.9" />
        <polygon points="32,6 32,37 32,58 38,50" fill="url(#shard-f1)" />
        <polygon points="32,6 41,23 38,50 32,58" fill="url(#shard-f3)" />
        <polygon points="32,6 23,23 32,18" fill="#ffffff" opacity="0.85" />
        <polygon
          points="32,6 23,23 26,50 32,58 38,50 41,23"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.55"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('select-none text-[15px] font-semibold tracking-tight text-fg', className)}>
      Shard
    </span>
  )
}
