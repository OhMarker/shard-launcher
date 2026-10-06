import { ArrowRight, GitCommitHorizontal, Tag } from 'lucide-react'
import { formatDate } from '@shared/format'
import { type ReleaseNote } from '@shared/types'
import { cn } from '@/lib/cn'
import { useUi } from '@/stores/ui'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { SectionHeader } from '@/components/ui/Misc'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { Markdown } from '@/pages/updates/Markdown'
import { excerptMarkdown } from '@/pages/updates/release-notes'
import { useReleaseNotes } from '@/pages/updates/useUpdates'

const MAX_NOTES = 3

function NoteCard({ note }: { note: ReleaseNote }) {
  const excerpt = excerptMarkdown(note.body)
  return (
    <Card padding="sm" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent" size="sm" icon={<Tag />}>
          <span className="font-mono">{note.tag}</span>
        </Badge>
        {note.prerelease && (
          <Badge tone="warning" size="sm">
            Pre-release
          </Badge>
        )}
        <span className="ml-auto text-xs text-fg-subtle">{formatDate(note.publishedAt)}</span>
      </div>
      {excerpt.text ? (
        <Markdown compact>{excerpt.text}</Markdown>
      ) : (
        <p className="text-[13px] text-fg-subtle">{note.name || 'No notes for this release.'}</p>
      )}
      {excerpt.truncated && <div className="text-xs text-fg-subtle">…</div>}
    </Card>
  )
}

/** The three newest launcher releases, abridged. Links to the Updates page for the rest. */
export function ChangelogColumn({ className }: { className?: string }) {
  const { data, isLoading, isError, refetch } = useReleaseNotes()
  const navigate = useUi((s) => s.navigate)
  const notes = data?.slice(0, MAX_NOTES) ?? []

  return (
    <section className={cn('flex flex-col', className)} aria-labelledby="home-changelog">
      <SectionHeader
        title={<span id="home-changelog">Launcher changelog</span>}
        description="What changed in Shard"
        action={
          <Button size="xs" variant="ghost" rightIcon={<ArrowRight />} onClick={() => navigate('updates')}>
            All releases
          </Button>
        }
      />
      <div className="mt-3 space-y-3">
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} padding="sm" className="space-y-3" aria-hidden>
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="ml-auto h-3 w-20" />
              </div>
              <SkeletonText lines={3} />
            </Card>
          ))
        ) : isError && notes.length === 0 ? (
          <EmptyState
            compact
            icon={<GitCommitHorizontal />}
            title="Couldn't load the changelog"
            description="GitHub may be unreachable. Playing is unaffected."
            action={
              <Button size="sm" variant="outline" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        ) : notes.length === 0 ? (
          <EmptyState compact icon={<GitCommitHorizontal />} title="No releases published yet" description="Release notes appear here once the first build ships." />
        ) : (
          notes.map((note) => <NoteCard key={note.tag} note={note} />)
        )}
      </div>
    </section>
  )
}
