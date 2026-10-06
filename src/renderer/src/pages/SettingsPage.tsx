import { motion } from 'framer-motion'
import { Coffee, HardDrive, Info, Link2, Palette, Rocket, UserRound } from 'lucide-react'
import { type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { PageBody, PageHeader } from '@/components/ui/Misc'
import { AboutSection } from '@/pages/settings/AboutSection'
import { AccountsSection } from '@/pages/settings/AccountsSection'
import { AppearanceSection } from '@/pages/settings/AppearanceSection'
import { IntegrationsSection } from '@/pages/settings/IntegrationsSection'
import { JavaSection } from '@/pages/settings/JavaSection'
import { LaunchSection } from '@/pages/settings/LaunchSection'
import { StorageSection } from '@/pages/settings/StorageSection'
import { useSectionNav } from '@/pages/settings/useSectionNav'

const SECTIONS: ReadonlyArray<{ id: string; label: string; icon: ReactNode }> = [
  { id: 'appearance', label: 'Appearance', icon: <Palette /> },
  { id: 'accounts', label: 'Accounts & sign-in', icon: <UserRound /> },
  { id: 'launch', label: 'Launch', icon: <Rocket /> },
  { id: 'java', label: 'Java', icon: <Coffee /> },
  { id: 'storage', label: 'Storage', icon: <HardDrive /> },
  { id: 'integrations', label: 'Integrations', icon: <Link2 /> },
  { id: 'about', label: 'About', icon: <Info /> }
]

const SECTION_IDS = SECTIONS.map((s) => s.id)

export function SettingsPage() {
  const { active, scrollTo } = useSectionNav(SECTION_IDS)

  return (
    <PageBody wide>
      <PageHeader title="Settings" description="Every change saves immediately." />
      <div className="mt-6 grid grid-cols-[196px_minmax(0,1fr)] gap-10">
        <nav aria-label="Settings sections" className="sticky top-1 self-start">
          <ul className="space-y-0.5">
            {SECTIONS.map((section) => {
              const isActive = active === section.id
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => scrollTo(section.id)}
                    aria-current={isActive ? 'true' : undefined}
                    className={cn(
                      'relative flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13px] font-medium transition-colors duration-150 [&_svg]:size-4 [&_svg]:shrink-0',
                      isActive ? 'text-fg' : 'text-fg-muted hover:bg-white/5 hover:text-fg'
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="settings-nav-active"
                        className="absolute inset-0 rounded-[10px] border border-line-strong bg-white/8 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]"
                        transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                      />
                    )}
                    <span className={cn('relative', isActive && 'text-accent')}>{section.icon}</span>
                    <span className="relative">{section.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="min-w-0 space-y-10 pb-[35vh]">
          <AppearanceSection />
          <AccountsSection />
          <LaunchSection />
          <JavaSection />
          <StorageSection />
          <IntegrationsSection />
          <AboutSection />
        </div>
      </div>
    </PageBody>
  )
}
