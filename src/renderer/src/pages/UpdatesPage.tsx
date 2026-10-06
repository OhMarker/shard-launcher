import { useSystemInfo } from '@/hooks/useSystemInfo'
import { PageBody, PageHeader, SectionHeader } from '@/components/ui/Misc'
import { LauncherUpdateCard } from '@/pages/updates/LauncherUpdateCard'
import { ReleaseNotesList } from '@/pages/updates/ReleaseNotesList'
import { ShardClientPanel } from '@/pages/updates/ShardClientPanel'
import { useUpdateState } from '@/pages/updates/useUpdates'

export function UpdatesPage() {
  const { data: state } = useUpdateState()
  const { data: info } = useSystemInfo()
  const currentVersion = state?.currentVersion ?? info?.launcherVersion

  return (
    <PageBody wide>
      <PageHeader title="Updates" description="Launcher releases and Shard client builds, side by side." />
      <div className="mt-6 grid grid-cols-2 gap-8">
        <section className="space-y-4" aria-labelledby="launcher-heading">
          <SectionHeader title={<span id="launcher-heading">Launcher</span>} description="Shard Launcher itself." />
          <LauncherUpdateCard />
          <div className="pt-2">
            <SectionHeader size="sm" title="Release notes" />
            <ReleaseNotesList currentVersion={currentVersion} className="mt-2" />
          </div>
        </section>
        <ShardClientPanel />
      </div>
    </PageBody>
  )
}
