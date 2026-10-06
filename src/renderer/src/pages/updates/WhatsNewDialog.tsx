import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { formatDate } from '@shared/format'
import { useSystemInfo } from '@/hooks/useSystemInfo'
import { invoke } from '@/lib/api'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { ShardMark } from '@/components/brand/Logo'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { SkeletonText } from '@/components/ui/Skeleton'
import { Markdown } from './Markdown'
import { findReleaseNote } from './release-notes'
import { useReleaseNotes } from './useUpdates'

/**
 * Mounted once by the app shell. Opens after an update (lastSeenVersion differs from the
 * running version) and on demand from the Updates page. The very first run only records
 * the version so the dialog is not shown on a fresh install.
 */
export function WhatsNewDialog() {
  const lastSeen = useSettings((s) => s.settings.lastSeenVersion)
  const { data: info } = useSystemInfo()
  const version = info?.launcherVersion
  const manualOpen = useUi((s) => s.whatsNewOpen)
  const setManualOpen = useUi((s) => s.setWhatsNewOpen)
  const navigate = useUi((s) => s.navigate)
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)

  const markSeen = useMutation({ mutationFn: () => invoke('updates:markSeen') })
  const { mutate: markSeenMutate } = markSeen

  // First run: remember the version silently so the dialog only appears after updates.
  useEffect(() => {
    if (version !== undefined && lastSeen === null) markSeenMutate()
  }, [version, lastSeen, markSeenMutate])

  const autoOpen = version !== undefined && lastSeen !== null && lastSeen !== version && dismissedVersion !== version
  const open = autoOpen || manualOpen
  const { data: notes, isLoading } = useReleaseNotes()
  const note = findReleaseNote(notes, version)

  const close = useCallback((): void => {
    if (autoOpen && version !== undefined) {
      setDismissedVersion(version)
      markSeenMutate()
    }
    setManualOpen(false)
  }, [autoOpen, version, markSeenMutate, setManualOpen])

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`What's new in ${version ?? 'Shard'}`}
      description={note ? `${note.name && note.name !== note.tag ? `${note.name} · ` : ''}${formatDate(note.publishedAt)}` : undefined}
      size="md"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              close()
              navigate('updates')
            }}
          >
            All releases
          </Button>
          <Button variant="primary" onClick={close} data-autofocus>
            Got it
          </Button>
        </>
      }
    >
      {isLoading ? (
        <SkeletonText lines={6} />
      ) : note && note.body.trim() ? (
        <Markdown>{note.body}</Markdown>
      ) : (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <ShardMark size={52} />
          <div className="text-base font-semibold text-fg">You&apos;re on the latest version</div>
          <p className="max-w-sm text-sm text-fg-muted">
            Shard {version ?? ''} is installed. Release notes for this version have not been published on GitHub yet.
          </p>
        </div>
      )}
    </Dialog>
  )
}
