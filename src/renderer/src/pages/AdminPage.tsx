import { LayoutDashboard, RefreshCw, ShieldCheck, Store, Ticket, UserCog, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { canEditPlayers, ROLE_LABELS, staffRoleOf } from '@shared/online'
import { useQueryClient } from '@tanstack/react-query'
import { readyState, useOnlineState, useRefreshOnline } from '@/hooks/useOnline'
import { usePageHint } from '@/stores/ui'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageBody, PageHeader } from '@/components/ui/Misc'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { OnlineEmptyState } from '@/components/online/OnlineNote'
import { PlayerAvatar } from '@/components/online/Presence'
import { CodesSection } from './admin/CodesSection'
import { OverviewSection, type StaffTab } from './admin/OverviewSection'
import { PlayersSection } from './admin/PlayersSection'
import { ShopSection } from './admin/ShopSection'
import { StaffSection } from './admin/StaffSection'
import { useAdminCodes, useAdminMutations, useAdminShop } from './admin/useAdmin'
import { useCosmeticsView } from './cosmetics/useCosmetics'

const ALL_TABS: readonly StaffTab[] = ['overview', 'players', 'shop', 'codes', 'roles']

export function AdminPage() {
  const qc = useQueryClient()
  const onlineQuery = useOnlineState()
  const refreshOnline = useRefreshOnline()
  const online = readyState(onlineQuery.data)
  const role = staffRoleOf(online?.me)
  // Mods may only look players up; owners and admins also run the shop and codes.
  const canEdit = canEditPlayers(role)
  const hint = usePageHint('admin')
  const [picked, setPicked] = useState<StaffTab | null>(() =>
    ALL_TABS.includes(hint as StaffTab) ? (hint as StaffTab) : null
  )
  const m = useAdminMutations(online?.me.uuid ?? null)
  const { data: catalogue } = useCosmeticsView()
  const adminShop = useAdminShop(canEdit)
  const codesQuery = useAdminCodes(canEdit)

  const names = useMemo(
    () => new Map((catalogue?.manifest.cosmetics ?? []).map((c) => [c.id, c.name])),
    [catalogue]
  )
  const shop = useMemo(() => online?.shop ?? [], [online])

  const tabs: TabItem<StaffTab>[] = canEdit
    ? [
        { value: 'overview', label: 'Overview', icon: <LayoutDashboard /> },
        { value: 'players', label: 'Players', icon: <Users /> },
        { value: 'shop', label: 'Shop', icon: <Store />, count: adminShop.data?.length },
        { value: 'codes', label: 'Codes', icon: <Ticket />, count: codesQuery.data?.length },
        { value: 'roles', label: 'Roles', icon: <UserCog /> }
      ]
    : [
        { value: 'players', label: 'Players', icon: <Users /> },
        { value: 'roles', label: 'Roles', icon: <UserCog /> }
      ]
  const tab = picked && tabs.some((t) => t.value === picked) ? picked : tabs[0]!.value

  return (
    <PageBody>
      <PageHeader
        title="Staff"
        description={
          canEdit || !role
            ? 'Run Shard: players, the shop, promo codes and roles. Every change applies to live players right away.'
            : 'Staff tools for the Shard API. Mods can look players up.'
        }
        action={
          role &&
          online && (
            <>
              <div className="glass flex h-11 items-center gap-2.5 rounded-[12px] pl-1.5 pr-3.5">
                <PlayerAvatar name={online.me.name} size={32} />
                <span className="leading-tight">
                  <span className="block text-sm font-semibold text-fg">{online.me.name}</span>
                  <span className="block text-[11px] text-fg-muted">Signed in as {ROLE_LABELS[role].toLowerCase()}</span>
                </span>
                <Badge tone="accent" size="sm" icon={<ShieldCheck />} className="ml-1">
                  {ROLE_LABELS[role]}
                </Badge>
              </div>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<RefreshCw />}
                onClick={() => void qc.invalidateQueries({ queryKey: ['admin'] })}
              >
                Refresh
              </Button>
            </>
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
            signedOutHint="Sign in with a Shard staff member's Microsoft account to use the staff tools."
          />
        ) : !role || !online ? (
          <div className="glass rounded-[var(--radius-lg)]">
            <EmptyState
              icon={<ShieldCheck />}
              title="Staff only"
              description="This account has no Shard staff role. The staff tools are for the owner, admins and mods."
            />
          </div>
        ) : (
          <div className="space-y-5">
            <Tabs<StaffTab> value={tab} onChange={setPicked} items={tabs} />

            {tab === 'overview' && (
              <OverviewSection shop={adminShop.data} codes={codesQuery.data} catalogue={catalogue} onOpen={setPicked} />
            )}
            {tab === 'players' && <PlayersSection canEdit={canEdit} names={names} shop={shop} m={m} />}
            {tab === 'shop' && canEdit && <ShopSection shop={shop} catalogue={catalogue} m={m} />}
            {tab === 'codes' && canEdit && (
              <CodesSection
                codes={codesQuery.data}
                loading={codesQuery.isLoading}
                error={codesQuery.isError ? codesQuery.error : null}
                onRetry={() => void codesQuery.refetch()}
                retrying={codesQuery.isFetching}
                catalogue={catalogue}
                m={m}
              />
            )}
            {tab === 'roles' && <StaffSection viewerRole={role} viewerUuid={online.me.uuid} m={m} />}
          </div>
        )}
      </div>
    </PageBody>
  )
}
