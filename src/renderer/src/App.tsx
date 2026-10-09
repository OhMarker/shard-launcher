import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import { useEffect, useState } from 'react'
import { queryClient } from '@/lib/api'
import { useGlobalEvents } from '@/lib/wire-events'
import { subscribeSettings, useSettings } from '@/stores/settings'
import { useUi, type Page } from '@/stores/ui'
import { Backdrop } from '@/components/layout/Backdrop'
import { PageTransition } from '@/components/layout/PageTransition'
import { Sidebar } from '@/components/layout/Sidebar'
import { StatusBar } from '@/components/layout/StatusBar'
import { Titlebar } from '@/components/layout/Titlebar'
import { ShardMark } from '@/components/brand/Logo'
import { ConfirmHost } from '@/components/ui/Dialog'
import { ToastViewport } from '@/components/ui/Toasts'
import { HomePage } from '@/pages/HomePage'
import { VersionsPage } from '@/pages/VersionsPage'
import { ModsPage } from '@/pages/ModsPage'
import { SkinsPage } from '@/pages/SkinsPage'
import { CosmeticsPage } from '@/pages/CosmeticsPage'
import { FriendsPage } from '@/pages/FriendsPage'
import { CodesPage } from '@/pages/CodesPage'
import { AdminPage } from '@/pages/AdminPage'
import { UpdatesPage } from '@/pages/UpdatesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { WhatsNewDialog } from '@/pages/updates/WhatsNewDialog'
import { SignInDialog } from '@/components/auth/SignInDialog'

const PAGE_COMPONENTS: Record<Page, () => JSX.Element> = {
  home: HomePage,
  versions: VersionsPage,
  mods: ModsPage,
  skins: SkinsPage,
  cosmetics: CosmeticsPage,
  codes: CodesPage,
  friends: FriendsPage,
  updates: UpdatesPage,
  settings: SettingsPage,
  admin: AdminPage
}

/** Sign-in requested from inside the game through the account bridge. */
function RequestedSignIn() {
  const open = useUi((s) => s.signInOpen)
  const setOpen = useUi((s) => s.setSignInOpen)
  return <SignInDialog open={open} onClose={() => setOpen(false)} />
}

function Shell() {
  const page = useUi((s) => s.page)
  const PageComponent = PAGE_COMPONENTS[page]
  useGlobalEvents()

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <Backdrop />
      <Titlebar />
      <div className="relative z-10 flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <PageTransition pageKey={page}>
            <PageComponent />
          </PageTransition>
        </main>
      </div>
      <StatusBar />
      <ToastViewport />
      <ConfirmHost />
      <WhatsNewDialog />
      <RequestedSignIn />
    </div>
  )
}

function Splash({ failed }: { failed: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-[#07090f] text-fg">
      <div className="drag-region absolute inset-x-0 top-0 h-9" />
      <ShardMark size={56} className={failed ? 'opacity-50' : 'animate-[pulse-soft_1.6s_ease-in-out_infinite]'} />
      <div className="text-sm text-fg-muted">
        {failed ? 'The launcher bridge is unavailable. Please restart Shard.' : 'Starting Shard…'}
      </div>
    </div>
  )
}

export function App() {
  const loaded = useSettings((s) => s.loaded)
  const load = useSettings((s) => s.load)
  const [failed, setFailed] = useState(() => typeof window.shard === 'undefined')

  useEffect(() => {
    if (typeof window.shard === 'undefined') return
    subscribeSettings()
    load().catch(() => setFailed(true))
  }, [load])

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">{loaded && !failed ? <Shell /> : <Splash failed={failed} />}</MotionConfig>
    </QueryClientProvider>
  )
}
