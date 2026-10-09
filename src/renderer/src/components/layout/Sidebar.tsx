import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Blocks, Download, House, Layers, Settings, ShieldCheck, Shirt, Sparkles, Ticket, Users } from 'lucide-react'
import { useEffect, useMemo, type ReactNode } from 'react'
import { useShardStaffRole } from '@/hooks/useOnline'
import { invoke, queryKeys } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useUi, type Page } from '@/stores/ui'
import { CreditsFooter } from '@/components/brand/Credits'
import { AccountChip } from './AccountChip'

const NAV: Array<{ page: Page; label: string; icon: ReactNode }> = [
  { page: 'home', label: 'Home', icon: <House /> },
  { page: 'versions', label: 'Versions', icon: <Layers /> },
  { page: 'mods', label: 'Mods', icon: <Blocks /> },
  { page: 'skins', label: 'Skins', icon: <Shirt /> },
  { page: 'cosmetics', label: 'Cosmetics', icon: <Sparkles /> },
  { page: 'codes', label: 'Codes', icon: <Ticket /> },
  { page: 'friends', label: 'Friends', icon: <Users /> },
  { page: 'updates', label: 'Updates', icon: <Download /> },
  { page: 'settings', label: 'Settings', icon: <Settings /> },
  { page: 'admin', label: 'Staff', icon: <ShieldCheck /> }
]

export function Sidebar() {
  const page = useUi((s) => s.page)
  const navigate = useUi((s) => s.navigate)
  const { data: updateState } = useQuery({
    queryKey: queryKeys.updates,
    queryFn: () => invoke('updates:getState'),
    staleTime: 60_000
  })
  const updateReady = updateState?.status === 'available' || updateState?.status === 'downloaded'
  // Staff tools appear only for Shard staff (owner, admin or mod; the API says so).
  const isStaff = useShardStaffRole() !== null
  const nav = useMemo(() => (isStaff ? NAV : NAV.filter((item) => item.page !== 'admin')), [isStaff])

  // Ctrl/Cmd + 1..9 jumps between the visible pages (a tenth page has no shortcut).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      const n = Number(e.key)
      const target = n >= 1 && n <= 9 ? nav[n - 1] : undefined
      if (target) {
        e.preventDefault()
        navigate(target.page)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, nav])

  return (
    <aside className="relative z-20 flex w-[216px] shrink-0 flex-col px-3 pb-3 pt-1">
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {nav.map((item, i) => {
          const active = page === item.page
          return (
            <button
              key={item.page}
              onClick={() => navigate(item.page)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group relative flex h-10 items-center gap-3 rounded-[11px] px-3 text-left text-[13.5px] font-medium transition-colors duration-150 [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-200',
                active ? 'text-fg' : 'text-fg-muted hover:bg-white/5 hover:text-fg hover:[&_svg]:-translate-y-px'
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-[11px] border border-line-strong bg-white/8 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]"
                  transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                />
              )}
              {active && (
                <motion.span
                  layoutId="sidebar-bar"
                  className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent shadow-[0_0_12px_rgb(var(--accent-rgb)/0.8)]"
                  transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                />
              )}
              <span className={cn('relative', active && 'text-accent')}>{item.icon}</span>
              <span className="relative flex-1">{item.label}</span>
              {item.page === 'updates' && updateReady && (
                <span className="relative size-2 rounded-full bg-accent shadow-[0_0_8px_rgb(var(--accent-rgb)/0.9)]" aria-label="Update available" />
              )}
              {i < 9 && (
                <span className="relative text-[10px] text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100">
                  {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}
                  {i + 1}
                </span>
              )}
            </button>
          )
        })}
      </nav>
      <div className="mt-auto pt-3">
        <AccountChip />
        <CreditsFooter />
      </div>
    </aside>
  )
}
