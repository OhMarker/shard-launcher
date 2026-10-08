import { formatRelative } from '@shared/format'
import { cn } from '@/lib/cn'

/** Stable hue per name, so a player's avatar keeps its colour across lists. */
function hueOf(name: string): number {
  let hash = 0
  for (const ch of name.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(hash) % 360
}

/**
 * Letter avatar for Shard players. The API shares only names (no skins), so this stays honest
 * about what friends can see.
 */
export function PlayerAvatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const hue = hueOf(name)
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(145deg, hsl(${hue} 70% 45% / 0.55), hsl(${hue} 70% 30% / 0.25))`,
        borderColor: `hsl(${hue} 70% 60% / 0.35)`
      }}
      className={cn('flex shrink-0 items-center justify-center rounded-[10px] border font-semibold uppercase text-fg', className)}
    >
      {name.slice(0, 1)}
    </span>
  )
}

/** "In game" (green dot) or "Offline · last seen 5 min ago". */
export function PresenceLabel({
  inGame,
  lastSeen,
  className
}: {
  inGame: boolean
  lastSeen: number | null
  className?: string
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-xs', inGame ? 'text-success' : 'text-fg-muted', className)}>
      <span
        aria-hidden
        className={cn(
          'size-2 shrink-0 rounded-full',
          inGame ? 'bg-success shadow-[0_0_8px_rgb(52_211_153/0.8)]' : 'bg-fg-subtle/60'
        )}
      />
      <span className="truncate">
        {inGame
          ? 'In game'
          : lastSeen === null
            ? 'Offline'
            : `Offline · last seen ${formatRelative(new Date(lastSeen).toISOString())}`}
      </span>
    </span>
  )
}
