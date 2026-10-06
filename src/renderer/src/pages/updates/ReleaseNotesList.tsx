import { ExternalLink, GitCommitHorizontal } from 'lucide-react'
import { useState } from 'react'
import { formatDate } from '@shared/format'
import { openExternal } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Collapsible } from './Collapsible'
import { Markdown } from './Markdown'
import { normalizeVersion } from './release-notes'
import { useReleaseNotes } from './useUpdates'

/** Sentinel for "the user collapsed everything" (null means "default: newest open"). */
const NONE = ''

export function ReleaseNotesList({ currentVersion, className }: { currentVersion: string | undefined; className?: string }) {
  const { data, isLoading, isError, refetch } = useReleaseNotes()
  const [expanded, setExpanded] = useState<string | null>(null)
  const openTag = expanded ?? data?.[0]?.tag ?? NONE
  const current = currentVersion ? normalizeVersion(currentVersion) : null

  if (isLoading) {
    return (
      <div className={cn('space-y-2', className)} aria-busy>
        {[0, 1, 2].map((i) => (
          <Card key={i} padding="none" className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-4" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="ml-auto h-3 w-20" />
          </Card>
        ))}
      </div>
    )
  }

  if (isError && !data) {
    return (
      <Card className={className}>
        <EmptyState
          compact
          icon={<GitCommitHorizontal />}
          title="Couldn't load release notes"
          description="GitHub may be unreachable right now."
          action={
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        />
      </Card>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card className={className}>
        <EmptyState compact icon={<GitCommitHorizontal />} title="No releases published yet" description="Release notes appear here once the first build ships." />
      </Card>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      {data.map((note) => {
        const open = openTag === note.tag
        const isCurrent = current !== null && normalizeVersion(note.tag) === current
        return (
          <Collapsible
            key={note.tag}
            open={open}
            onToggle={() => setExpanded(open ? NONE : note.tag)}
            header={
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-fg">{note.tag}</span>
                {note.name && note.name !== note.tag && <span className="truncate text-sm text-fg-muted">{note.name}</span>}
                {note.prerelease && (
                  <Badge tone="warning" size="sm">
                    Pre-release
                  </Badge>
                )}
                {isCurrent && (
                  <Badge tone="accent" size="sm">
                    Installed
                  </Badge>
                )}
                <span className="ml-auto text-xs tabular-nums text-fg-subtle">{formatDate(note.publishedAt)}</span>
              </div>
            }
          >
            {note.body.trim() ? <Markdown>{note.body}</Markdown> : <p className="text-sm text-fg-subtle">No notes were written for this release.</p>}
            <div className="mt-3">
              <Button size="xs" variant="outline" rightIcon={<ExternalLink />} onClick={() => openExternal(note.url)}>
                View on GitHub
              </Button>
            </div>
          </Collapsible>
        )
      })}
    </div>
  )
}
