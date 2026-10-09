import { Search, ShieldCheck, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { ROLE_LABELS, rolesYouCanAssign, staffRoleOf, type AssignableRole } from '@shared/online'
import { type AdminPlayer, type StaffRole } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { confirm } from '@/components/ui/confirm'
import { ErrorCard } from '@/components/mods/ErrorCard'
import { PlayerAvatar } from '@/components/online/Presence'
import { useDebouncedValue } from '../mods/useDebouncedValue'
import { RoleBadge } from './RoleBadge'
import { useAdminPlayers, useAdminStaff, type AdminMutations } from './useAdmin'

type RoleValue = 'admin' | 'mod' | 'none'

const toValue = (role: AssignableRole | StaffRole): RoleValue => (role === 'admin' || role === 'mod' ? role : 'none')
const fromValue = (value: RoleValue): AssignableRole => (value === 'none' ? null : value)
const VALUE_LABELS: Record<RoleValue, string> = { admin: 'Admin', mod: 'Mod', none: 'No role' }
const ORDER: Record<StaffRole, number> = { owner: 0, admin: 1, mod: 2 }

export interface StaffSectionProps {
  viewerRole: StaffRole
  viewerUuid: string
  m: AdminMutations
}

/** Asks first when a change takes someone's role away, then sends it. */
async function setRole(m: AdminMutations, player: AdminPlayer, role: AssignableRole): Promise<void> {
  const current = staffRoleOf(player)
  if (role === null && current) {
    const ok = await confirm({
      title: `Remove ${player.name}'s ${ROLE_LABELS[current]} role?`,
      message: 'They lose the staff tools right away. You can give the role back later.',
      confirmLabel: 'Remove role',
      danger: true
    })
    if (!ok) return
  }
  m.role.mutate({ player: player.uuid, role })
}

function StaffRow({ player, viewerRole, viewerUuid, m }: { player: AdminPlayer } & StaffSectionProps) {
  const options = rolesYouCanAssign(viewerRole, viewerUuid, player)
  const current = staffRoleOf(player)
  const busy = m.role.isPending && m.role.variables?.player === player.uuid
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <PlayerAvatar name={player.name} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-fg">{player.name}</span>
          <RoleBadge player={player} />
          {player.uuid === viewerUuid && <span className="text-[11px] text-fg-subtle">you</span>}
        </div>
        <div className="truncate font-mono text-[10.5px] text-fg-subtle">{player.uuid}</div>
      </div>
      {options.length > 0 && current !== null && current !== 'owner' && (
        <Select<RoleValue>
          size="sm"
          value={toValue(current)}
          disabled={busy}
          onChange={(value) => void setRole(m, player, fromValue(value))}
          options={[toValue(current), ...options.map(toValue)].map((v) => ({ value: v, label: VALUE_LABELS[v] }))}
          aria-label={`Role of ${player.name}`}
          className="w-32"
        />
      )}
    </li>
  )
}

function AddStaff({ viewerRole, viewerUuid, m }: StaffSectionProps) {
  const [query, setQuery] = useState('')
  const q = useDebouncedValue(query.trim(), 300)
  const results = useAdminPlayers(q, q.length > 0)
  const candidates = q ? (results.data ?? []).filter((p) => staffRoleOf(p) === null).slice(0, 5) : []

  return (
    <div className="space-y-2 border-t border-line bg-white/2 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-fg">Add staff</div>
          <p className="text-xs text-fg-muted">
            {viewerRole === 'owner' ? 'Find a player and make them a mod or an admin.' : 'Find a player and make them a mod.'}
          </p>
        </div>
        <Input
          size="sm"
          leftIcon={<Search />}
          placeholder="Player name"
          aria-label="Find a player to add as staff"
          value={query}
          maxLength={16}
          onChange={(e) => setQuery(e.target.value)}
          className="w-56"
        />
      </div>
      {!q ? null : results.isError ? (
        <ErrorCard error={results.error} onRetry={() => void results.refetch()} retrying={results.isFetching} />
      ) : results.isLoading ? (
        <Skeleton className="h-9 w-full" />
      ) : candidates.length === 0 ? (
        <p className="text-xs text-fg-subtle">
          Nobody without a role matches &quot;{q}&quot;. Players appear once they sign in to Shard.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[12px] border border-line">
          {candidates.map((p) => {
            // Mod first, then Admin (owners only).
            const options = rolesYouCanAssign(viewerRole, viewerUuid, p)
              .filter((r): r is 'admin' | 'mod' => r !== null)
              .reverse()
            const busy = m.role.isPending && m.role.variables?.player === p.uuid
            return (
              <li key={p.uuid} className="flex items-center gap-2 px-3 py-2">
                <PlayerAvatar name={p.name} size={24} />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{p.name}</span>
                {options.map((role) => (
                  <Button
                    key={role}
                    size="xs"
                    variant="secondary"
                    leftIcon={<UserPlus />}
                    loading={busy && m.role.variables?.role === role}
                    disabled={busy}
                    onClick={() => m.role.mutate({ player: p.uuid, role })}
                  >
                    Make {ROLE_LABELS[role].toLowerCase()}
                  </Button>
                ))}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Who is staff, and (for owners and admins) giving and taking roles. */
export function StaffSection(props: StaffSectionProps) {
  const { viewerRole, m } = props
  const staffQuery = useAdminStaff(true)
  const staff = [...(staffQuery.data ?? [])].sort(
    (a, b) => ORDER[staffRoleOf(a) ?? 'mod'] - ORDER[staffRoleOf(b) ?? 'mod'] || a.name.localeCompare(b.name)
  )
  const canAssign = viewerRole === 'owner' || viewerRole === 'admin'

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="border-b border-line px-4 py-3.5">
        <h2 className="text-base font-semibold tracking-tight text-fg">Roles</h2>
        <p className="text-xs text-fg-muted">
          {viewerRole === 'owner'
            ? 'Owners add and remove admins and mods. Owners themselves are set on the server.'
            : viewerRole === 'admin'
              ? 'Admins add and remove mods. Owners manage admins.'
              : 'Owners and admins manage roles.'}
        </p>
      </div>
      {m.role.isError && <ErrorCard className="m-4" error={m.role.error} />}
      {staffQuery.isLoading ? (
        <div className="space-y-3 px-4 py-3" aria-hidden>
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : staffQuery.isError ? (
        <ErrorCard
          className="m-4"
          error={staffQuery.error}
          onRetry={() => void staffQuery.refetch()}
          retrying={staffQuery.isFetching}
        />
      ) : staff.length === 0 ? (
        <EmptyState compact icon={<ShieldCheck />} title="No staff yet" description="Owners come from the server settings." />
      ) : (
        <ul className="divide-y divide-line">
          {staff.map((p) => (
            <StaffRow key={p.uuid} player={p} {...props} />
          ))}
        </ul>
      )}
      {canAssign && <AddStaff {...props} />}
    </Card>
  )
}
