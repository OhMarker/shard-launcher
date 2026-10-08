import { Check, Search, ShieldCheck, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { type AdminPlayer } from '@shared/types'
import { readyState, useOnlineState, useRefreshOnline } from '@/hooks/useOnline'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageBody, PageHeader } from '@/components/ui/Misc'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorCard } from '@/components/mods/ErrorCard'
import { OnlineEmptyState } from '@/components/online/OnlineNote'
import { PlayerAvatar, PresenceLabel } from '@/components/online/Presence'
import { PlayerDialog, type AdminItem } from './admin/PlayerDialog'
import { ShopSection } from './admin/ShopSection'
import { useAdminMutations, useAdminPlayers } from './admin/useAdmin'
import { useCosmeticsView } from './cosmetics/useCosmetics'
import { useDebouncedValue } from './mods/useDebouncedValue'

const COLUMNS = 'grid grid-cols-[minmax(0,1.3fr)_88px_minmax(0,1.1fr)_minmax(0,1.3fr)_92px] items-center gap-4'

function PlayerRow({
  player,
  nameOf,
  onManage
}: {
  player: AdminPlayer
  nameOf: (id: string) => string
  onManage: () => void
}) {
  return (
    <li className={`${COLUMNS} px-4 py-2.5`}>
      <div className="flex min-w-0 items-center gap-3">
        <PlayerAvatar name={player.name} size={32} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-fg">{player.name}</span>
            {player.admin && (
              <Badge size="sm" tone="accent">
                Admin
              </Badge>
            )}
          </div>
          <div className="truncate font-mono text-[10.5px] text-fg-subtle">{player.uuid}</div>
        </div>
      </div>
      <div className="text-sm font-semibold tabular-nums text-fg">{player.tokens}</div>
      <PresenceLabel inGame={player.inGame} lastSeen={player.lastSeen} />
      <div className="flex min-w-0 flex-wrap gap-1">
        {player.owned.length === 0 ? (
          <span className="text-xs text-fg-subtle">None</span>
        ) : (
          player.owned.map((id) => (
            <Badge
              key={id}
              size="sm"
              tone={player.cape === id ? 'accent' : 'neutral'}
              icon={player.cape === id ? <Check /> : undefined}
              title={player.cape === id ? 'Wearing it' : 'Owned'}
            >
              {nameOf(id)}
            </Badge>
          ))
        )}
      </div>
      <div className="flex justify-end">
        <Button size="xs" variant="secondary" onClick={onManage}>
          Manage
        </Button>
      </div>
    </li>
  )
}

export function AdminPage() {
  const onlineQuery = useOnlineState()
  const refreshOnline = useRefreshOnline()
  const online = readyState(onlineQuery.data)
  const isAdmin = online?.me.admin ?? false
  const [query, setQuery] = useState('')
  const q = useDebouncedValue(query.trim(), 300)
  const playersQuery = useAdminPlayers(q, isAdmin)
  const m = useAdminMutations(online?.me.uuid ?? null)
  const { data: catalogue } = useCosmeticsView()
  const [manage, setManage] = useState<{ uuid: string; open: boolean } | null>(null)

  const names = useMemo(
    () => new Map((catalogue?.manifest.cosmetics ?? []).map((c) => [c.id, c.name])),
    [catalogue]
  )
  const nameOf = (id: string): string => names.get(id) ?? id
  const shop = useMemo(() => online?.shop ?? [], [online])

  const players = playersQuery.data ?? []
  // Re-read the player from the latest search so the dialog reflects each change.
  const managed = manage ? (players.find((p) => p.uuid === manage.uuid) ?? null) : null
  const items: AdminItem[] = useMemo(() => {
    const ids = new Set([...shop.map((s) => s.id), ...names.keys(), ...(managed?.owned ?? [])])
    return [...ids].map((id) => ({
      id,
      name: names.get(id) ?? id,
      price: shop.find((s) => s.id === id)?.price ?? null
    }))
  }, [shop, names, managed])

  return (
    <PageBody>
      <PageHeader
        title="Admin"
        description="Owner tools for the Shard API. Every change applies to the live player right away."
        action={
          isAdmin && (
            <Badge tone="accent" icon={<ShieldCheck />}>
              Signed in as {online?.me.name}
            </Badge>
          )
        }
      />

      <div className="mt-6">
        {onlineQuery.isLoading ? (
          <Card padding="md">
            <Skeleton className="h-9 w-full" />
          </Card>
        ) : onlineQuery.data && onlineQuery.data.status !== 'ready' ? (
          <OnlineEmptyState
            state={onlineQuery.data}
            onRetry={() => refreshOnline.mutate()}
            retrying={refreshOnline.isPending}
            signedOutHint="Sign in with the owner's Microsoft account to use the admin tools."
          />
        ) : !isAdmin ? (
          <div className="glass rounded-[var(--radius-lg)]">
            <EmptyState
              icon={<ShieldCheck />}
              title="Admins only"
              description="This account is not a Shard admin. The admin tools are for the Shard owner."
            />
          </div>
        ) : (
          <div className="space-y-6">
            <Card padding="none" className="overflow-hidden">
              <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold tracking-tight text-fg">Players</h2>
                  <p className="text-xs text-fg-muted">Most recently in game first. Players appear once they sign in to Shard.</p>
                </div>
                <Input
                  leftIcon={<Search />}
                  placeholder="Search by name"
                  aria-label="Search players by name"
                  value={query}
                  maxLength={16}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-64"
                />
              </div>
              <div className={`${COLUMNS} border-b border-line bg-white/2 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle`}>
                <span>Player</span>
                <span>Tokens</span>
                <span>Status</span>
                <span>Capes</span>
                <span />
              </div>
              {playersQuery.isLoading ? (
                <div className="space-y-3 px-4 py-3" aria-hidden>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : playersQuery.isError ? (
                <ErrorCard
                  className="m-4"
                  error={playersQuery.error}
                  onRetry={() => void playersQuery.refetch()}
                  retrying={playersQuery.isFetching}
                />
              ) : players.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Users />}
                  title={q ? 'No players match' : 'No players yet'}
                  description={q ? `Nobody whose name contains "${q}" has signed in to Shard.` : 'Players show up here after their first Shard sign-in.'}
                />
              ) : (
                <ul className="divide-y divide-line">
                  {players.map((p) => (
                    <PlayerRow key={p.uuid} player={p} nameOf={nameOf} onManage={() => setManage({ uuid: p.uuid, open: true })} />
                  ))}
                </ul>
              )}
            </Card>

            <ShopSection shop={shop} names={names} m={m} />
          </div>
        )}
      </div>

      <PlayerDialog
        player={managed}
        open={manage?.open ?? false}
        onClose={() => setManage((cur) => (cur ? { ...cur, open: false } : null))}
        items={items}
        m={m}
      />
    </PageBody>
  )
}
