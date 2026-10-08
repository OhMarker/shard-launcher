import { Coins } from 'lucide-react'
import { minutesToNextTokens } from '@shared/online'
import { type ShardMe } from '@shared/types'
import { Tooltip } from '@/components/ui/Tooltip'

/** Header pill: balance plus how tokens are earned and when the next ones land. */
export function TokenBalance({ me }: { me: ShardMe }) {
  const minutes = minutesToNextTokens(me.secondsToNextTokens)
  return (
    <Tooltip
      content={`Shard Client adds 10 tokens for every 10 minutes you actively play. Your next 10 arrive after about ${minutes} more min of play.`}
    >
      <div
        className="glass flex h-11 items-center gap-2.5 rounded-[12px] pl-1.5 pr-3.5"
        aria-label={`${me.tokens} tokens. Plus 10 every 10 minutes you play, next in ${minutes} minutes.`}
      >
        <span className="flex size-8 items-center justify-center rounded-[9px] bg-warning/15 text-warning shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]">
          <Coins className="size-4" />
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold tabular-nums text-fg">
            {me.tokens} <span className="font-medium text-fg-muted">tokens</span>
          </span>
          <span className="block text-[11px] text-fg-muted">
            +10 every 10 min you play · next in {minutes} min
          </span>
        </span>
      </div>
    </Tooltip>
  )
}
