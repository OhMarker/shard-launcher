import { Check, Coins, Minus, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { type AdminPlayer } from '@shared/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { InlineCode } from '@/components/ui/Misc'
import { confirm } from '@/components/ui/confirm'
import { PlayerAvatar, PresenceLabel } from '@/components/online/Presence'
import { RoleBadge } from './RoleBadge'
import { type AdminMutations } from './useAdmin'

export interface AdminItem {
  id: string
  name: string
  /** null when the shop does not sell it (it can still be granted). */
  price: number | null
}

export interface PlayerDialogProps {
  /** Kept while the dialog animates out, so `open` is separate. */
  player: AdminPlayer | null
  open: boolean
  onClose: () => void
  items: readonly AdminItem[]
  m: AdminMutations
  /** False for mods: they see the player but every write control is hidden. */
  canEdit: boolean
}

const MAX_AMOUNT = 1_000_000

function TokensForm({ player, m }: { player: AdminPlayer; m: AdminMutations }) {
  const [raw, setRaw] = useState('')
  const amount = Number(raw)
  const valid = raw.trim() !== '' && Number.isInteger(amount) && amount !== 0 && Math.abs(amount) <= MAX_AMOUNT
  const taking = valid && amount < 0

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!valid) return
    if (taking) {
      const ok = await confirm({
        title: `Take ${-amount} tokens from ${player.name}?`,
        message: `They have ${player.tokens}. A balance never goes below 0.`,
        confirmLabel: `Take ${-amount}`,
        danger: true
      })
      if (!ok) return
    }
    m.tokens.mutate({ player: player.uuid, amount }, { onSuccess: () => setRaw('') })
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex items-start gap-2">
      <Input
        type="number"
        inputMode="numeric"
        step={1}
        leftIcon={<Coins />}
        placeholder="Amount, negative to take"
        aria-label="Token amount"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        error={raw.trim() !== '' && !valid ? 'A whole number, not 0, up to 1,000,000 either way.' : null}
        className="flex-1"
      />
      <Button
        type="submit"
        variant={taking ? 'danger' : 'primary'}
        leftIcon={taking ? <Minus /> : <Plus />}
        loading={m.tokens.isPending}
        disabled={!valid}
        className="min-w-[112px]"
      >
        {valid ? (taking ? `Take ${-amount}` : `Give ${amount}`) : 'Give'}
      </Button>
    </form>
  )
}

/** Tokens and ownership for one player. */
export function PlayerDialog({ player, open, onClose, items, m, canEdit }: PlayerDialogProps) {
  const revoke = async (p: AdminPlayer, item: AdminItem): Promise<void> => {
    const ok = await confirm({
      title: `Revoke ${item.name} from ${p.name}?`,
      message:
        p.cape === item.id
          ? 'They are wearing it; it comes off right away. Tokens they spent are not refunded.'
          : 'Tokens they spent are not refunded.',
      confirmLabel: 'Revoke',
      danger: true
    })
    if (ok) m.revoke.mutate({ player: p.uuid, id: item.id })
  }

  const busy = (mutation: AdminMutations['grant'], id: string): boolean =>
    mutation.isPending && mutation.variables?.id === id && mutation.variables.player === player?.uuid

  return (
    <Dialog
      open={open && player !== null}
      onClose={onClose}
      title={player?.name}
      description={player ? <InlineCode>{player.uuid}</InlineCode> : undefined}
      size="md"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      }
    >
      {player && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-[12px] border border-line bg-white/4 p-3">
            <PlayerAvatar name={player.name} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium text-fg">
                {player.name}
                <RoleBadge player={player} />
              </div>
              <PresenceLabel inGame={player.inGame} lastSeen={player.lastSeen} className="mt-0.5" />
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold tabular-nums text-fg">{player.tokens}</div>
              <div className="text-[11px] text-fg-subtle">tokens</div>
            </div>
          </div>

          {canEdit ? (
            <section className="space-y-2">
              <div className="text-[13px] font-medium text-fg">Give or take tokens</div>
              <TokensForm key={player.uuid} player={player} m={m} />
            </section>
          ) : (
            <p className="text-xs text-fg-muted">Mods can look players up. Owners and admins change tokens and cosmetics.</p>
          )}

          <section className="space-y-2">
            <div className="text-[13px] font-medium text-fg">Cosmetics</div>
            {player.admin && (
              <p className="text-xs text-fg-muted">Admins own every shop item, so there is nothing to grant.</p>
            )}
            <ul className="divide-y divide-line overflow-hidden rounded-[12px] border border-line">
              {items.map((item) => {
                const owns = player.owned.includes(item.id)
                return (
                  <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm text-fg">
                        <span className="truncate">{item.name}</span>
                        {player.cape === item.id && (
                          <Badge size="sm" tone="accent" icon={<Check />}>
                            Wearing
                          </Badge>
                        )}
                        {owns && player.cape !== item.id && (
                          <Badge size="sm" tone="success">
                            Owned
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-[11px] text-fg-subtle">
                        {item.id} · {item.price === null ? 'not in the shop' : `${item.price} tokens`}
                      </div>
                    </div>
                    {!canEdit ? null : owns ? (
                      <Button
                        size="xs"
                        variant="danger"
                        disabled={player.admin}
                        loading={busy(m.revoke, item.id)}
                        onClick={() => void revoke(player, item)}
                      >
                        Revoke
                      </Button>
                    ) : (
                      <Button
                        size="xs"
                        variant="secondary"
                        loading={busy(m.grant, item.id)}
                        onClick={() => m.grant.mutate({ player: player.uuid, id: item.id })}
                      >
                        Grant
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
      )}
    </Dialog>
  )
}
