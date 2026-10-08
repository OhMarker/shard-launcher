import { Check, RefreshCw, Send, UserMinus, UserPlus, Users, X } from 'lucide-react'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { isValidMinecraftName, sortFriends } from '@shared/online'
import { pluralize } from '@shared/format'
import { type FriendPerson } from '@shared/types'
import { readyState, useOnlineState, useRefreshOnline } from '@/hooks/useOnline'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageBody, PageHeader } from '@/components/ui/Misc'
import { Skeleton } from '@/components/ui/Skeleton'
import { confirm } from '@/components/ui/confirm'
import { ErrorCard } from '@/components/mods/ErrorCard'
import { OnlineEmptyState } from '@/components/online/OnlineNote'
import { PlayerAvatar, PresenceLabel } from '@/components/online/Presence'
import { useFriendsMutations, useFriendsView } from './friends/useFriends'

function SectionTitle({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 px-4 pb-2 pt-3.5">
      <h2 className="text-[13px] font-medium text-fg">{title}</h2>
      {count !== undefined && count > 0 && (
        <Badge size="sm" tone="neutral">
          {count}
        </Badge>
      )}
    </div>
  )
}

function PersonRow({ person, detail, actions }: { person: FriendPerson; detail: ReactNode; actions: ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <PlayerAvatar name={person.name} size={34} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-fg">{person.name}</div>
        <div className="mt-0.5 flex min-w-0">{detail}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
    </li>
  )
}

function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 px-4 py-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-[34px] rounded-[10px]" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}

function AddFriendCard({ onAdd, pending }: { onAdd: (name: string) => Promise<unknown>; pending: boolean }) {
  const [name, setName] = useState('')
  const trimmed = name.trim()
  const invalid = trimmed.length > 0 && !isValidMinecraftName(trimmed)

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (!trimmed || invalid) return
    onAdd(trimmed).then(
      () => setName(''),
      () => undefined
    )
  }

  return (
    <Card padding="md">
      <div className="text-[13px] font-medium text-fg">Add a friend</div>
      <p className="mt-0.5 text-xs text-fg-muted">
        Type their Minecraft name. They need to have signed in to Shard once.
      </p>
      <form onSubmit={submit} className="mt-3 flex items-start gap-2">
        <Input
          leftIcon={<UserPlus />}
          placeholder="Minecraft name"
          aria-label="Minecraft name"
          value={name}
          maxLength={16}
          spellCheck={false}
          onChange={(e) => setName(e.target.value)}
          error={invalid ? 'Names use letters, numbers and _ (up to 16).' : null}
          className="flex-1"
        />
        <Button type="submit" variant="primary" leftIcon={<Send />} loading={pending} disabled={!trimmed || invalid}>
          Add
        </Button>
      </form>
    </Card>
  )
}

export function FriendsPage() {
  const onlineQuery = useOnlineState()
  const refreshOnline = useRefreshOnline()
  const online = readyState(onlineQuery.data)
  const friendsQuery = useFriendsView(online !== null)
  const m = useFriendsMutations()

  const view = friendsQuery.data
  const friends = useMemo(() => sortFriends(view?.friends ?? []), [view])
  const playing = friends.filter((f) => f.inGame).length

  const busy = (mutation: { isPending: boolean; variables?: string }, uuid: string): boolean =>
    mutation.isPending && mutation.variables === uuid

  const removeFriend = async (person: FriendPerson): Promise<void> => {
    const ok = await confirm({
      title: `Remove ${person.name}?`,
      message: 'You will stop seeing each other in your friends lists. You can add them again later.',
      confirmLabel: 'Remove friend',
      danger: true
    })
    if (ok) m.remove.mutate(person.uuid)
  }

  return (
    <PageBody>
      <PageHeader
        title="Friends"
        description="See which friends are in game. Friends see only your name and whether you are playing, never your server or position."
        action={
          online && (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<RefreshCw />}
              loading={friendsQuery.isFetching && !friendsQuery.isLoading}
              onClick={() => void friendsQuery.refetch()}
            >
              Refresh
            </Button>
          )
        }
      />

      <div className="mt-6">
        {onlineQuery.isLoading ? (
          <Card padding="none">
            <ListSkeleton />
          </Card>
        ) : onlineQuery.data && onlineQuery.data.status !== 'ready' ? (
          <OnlineEmptyState
            state={onlineQuery.data}
            onRetry={() => refreshOnline.mutate()}
            retrying={refreshOnline.isPending}
            signedOutHint="Sign in with your Microsoft account to add friends and see who is in game."
          />
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-6">
            <Card padding="none" className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-fg">Your friends</h2>
                  <p className="text-xs text-fg-muted">
                    {view
                      ? `${pluralize(friends.length, 'friend')}${playing > 0 ? ` · ${playing} in game` : ''}`
                      : 'Loading…'}
                  </p>
                </div>
              </div>
              {friendsQuery.isLoading ? (
                <ListSkeleton />
              ) : friendsQuery.isError ? (
                <ErrorCard
                  className="m-4"
                  error={friendsQuery.error}
                  onRetry={() => void friendsQuery.refetch()}
                  retrying={friendsQuery.isFetching}
                />
              ) : friends.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Users />}
                  title="No friends yet"
                  description="Add someone by their Minecraft name. Once they accept, you will see when they are in game."
                />
              ) : (
                <ul className="divide-y divide-line">
                  {friends.map((f) => (
                    <PersonRow
                      key={f.uuid}
                      person={f}
                      detail={<PresenceLabel inGame={f.inGame} lastSeen={f.lastSeen} />}
                      actions={
                        <IconButton
                          label={`Remove ${f.name}`}
                          size="sm"
                          variant="danger"
                          disabled={busy(m.remove, f.uuid)}
                          onClick={() => void removeFriend(f)}
                        >
                          <UserMinus />
                        </IconButton>
                      }
                    />
                  ))}
                </ul>
              )}
            </Card>

            <div className="space-y-4">
              <AddFriendCard onAdd={(name) => m.request.mutateAsync(name)} pending={m.request.isPending} />

              <Card padding="none" className="overflow-hidden pb-1.5">
                <SectionTitle title="Requests" count={view?.incoming.length} />
                {!view ? (
                  <ListSkeleton rows={1} />
                ) : view.incoming.length === 0 ? (
                  <p className="px-4 pb-2.5 text-xs text-fg-subtle">No one is waiting for an answer.</p>
                ) : (
                  <ul>
                    {view.incoming.map((p) => (
                      <PersonRow
                        key={p.uuid}
                        person={p}
                        detail={<span className="text-xs text-fg-muted">Wants to be friends</span>}
                        actions={
                          <>
                            <Button
                              size="xs"
                              variant="primary"
                              leftIcon={<Check />}
                              loading={busy(m.accept, p.uuid)}
                              onClick={() => m.accept.mutate(p.uuid)}
                            >
                              Accept
                            </Button>
                            <IconButton
                              label={`Decline ${p.name}`}
                              size="xs"
                              disabled={busy(m.decline, p.uuid)}
                              onClick={() => m.decline.mutate(p.uuid)}
                            >
                              <X />
                            </IconButton>
                          </>
                        }
                      />
                    ))}
                  </ul>
                )}

                <div className="mx-4 mt-1 h-px bg-line" />
                <SectionTitle title="Sent" count={view?.outgoing.length} />
                {!view ? (
                  <ListSkeleton rows={1} />
                ) : view.outgoing.length === 0 ? (
                  <p className="px-4 pb-2.5 text-xs text-fg-subtle">No requests waiting on someone else.</p>
                ) : (
                  <ul>
                    {view.outgoing.map((p) => (
                      <PersonRow
                        key={p.uuid}
                        person={p}
                        detail={<span className="text-xs text-fg-muted">Waiting for them to accept</span>}
                        actions={
                          <Button
                            size="xs"
                            variant="ghost"
                            loading={busy(m.decline, p.uuid)}
                            onClick={() => m.decline.mutate(p.uuid)}
                          >
                            Cancel
                          </Button>
                        }
                      />
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </PageBody>
  )
}
