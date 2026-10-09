import { Coins } from 'lucide-react'
import { buyState } from '@shared/online'
import { Button, type ButtonSize } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'

/** A shop price next to the player's balance; present only while signed in to the Shard API. */
export interface BuyOffer {
  /** What it costs now (after any sale). */
  price: number
  tokens: number
  /** The price before a sale, shown struck through; absent or null when not on sale. */
  was?: number | null
  /** "-20%" during a sale. */
  badge?: string | null
}

export interface BuyButtonProps {
  offer: BuyOffer
  onBuy: () => void
  loading?: boolean
  size?: ButtonSize
  fullWidth?: boolean
}

/** "Buy · 1000", or a disabled "Need 300 more" when the balance is short. */
export function BuyButton({ offer, onBuy, loading, size = 'xs', fullWidth }: BuyButtonProps) {
  const state = buyState(offer.price, offer.tokens, false)
  if (state.kind === 'short') {
    return (
      <Tooltip content={`Costs ${state.price} tokens. You earn 10 for every 10 minutes you play.`}>
        <span className={fullWidth ? 'inline-flex w-full' : 'inline-flex'}>
          <Button size={size} variant="outline" fullWidth={fullWidth} disabled leftIcon={<Coins />}>
            Need {state.need} more
          </Button>
        </span>
      </Tooltip>
    )
  }
  return (
    <Button size={size} variant="primary" fullWidth={fullWidth} loading={loading} leftIcon={<Coins />} onClick={onBuy}>
      Buy · {offer.price}
      {offer.was != null && (
        <s className="ml-0.5 font-normal opacity-60" aria-label={`was ${offer.was}`}>
          {offer.was}
        </s>
      )}
    </Button>
  )
}
