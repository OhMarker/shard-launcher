import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  BookOpen,
  Bug,
  Check,
  ChevronLeft,
  ChevronRight,
  Code,
  Download,
  ExternalLink,
  Heart,
  MessageCircle
} from 'lucide-react'
import { useMemo, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { formatCount, formatDate, formatRelative } from '@shared/format'
import {
  type InstanceModsView,
  type ModrinthGalleryItem,
  type ModrinthProject,
  type ModrinthVersionType
} from '@shared/types'
import { openExternal } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { ErrorCard } from '@/components/mods/ErrorCard'
import { InstallStateControl } from '@/components/mods/InstallStateControl'
import { BusyGuard } from '@/components/mods/BusyGuard'
import { ModIcon } from '@/components/mods/ModIcon'
import {
  categoryLabel,
  conflictReasonForSlug,
  hitState,
  installedVersionIds,
  modrinthModUrl,
  sortGallery,
  versionsForGame
} from './mods-utils'
import { type InstallFlow } from './useInstallFlow'
import { useModrinthProject, useModrinthVersions } from './useModrinth'

export interface ModrinthProjectPanelProps {
  idOrSlug: string
  /** Search hits know the author; the project endpoint does not. */
  author: string | null
  view: InstanceModsView
  busy: boolean
  flow: InstallFlow
  onBack: () => void
}

const VERSION_TONES: Record<ModrinthVersionType, BadgeTone> = {
  release: 'success',
  beta: 'warning',
  alpha: 'danger'
}

/** Markdown links open in the system browser; everything else renders as usual. */
const MD_COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault()
        if (href && /^https?:\/\//i.test(href)) openExternal(href)
      }}
    >
      {children}
    </a>
  ),
  img: ({ src, alt }) => <img src={src} alt={alt ?? ''} loading="lazy" draggable={false} />
}

function GalleryCarousel({ items }: { items: ModrinthGalleryItem[] }) {
  const [index, setIndex] = useState(0)
  const current = items[Math.min(index, items.length - 1)]!
  const go = (delta: number): void => setIndex((i) => (i + delta + items.length) % items.length)
  return (
    <figure className="overflow-hidden rounded-[14px] border border-line bg-black/30">
      <div className="relative aspect-video">
        <AnimatePresence mode="wait" initial={false}>
          <motion.img
            key={current.url}
            src={current.url}
            alt={current.title ?? ''}
            draggable={false}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 size-full object-cover"
          />
        </AnimatePresence>
        {items.length > 1 && (
          <>
            <IconButton
              label="Previous image"
              size="sm"
              variant="secondary"
              className="absolute left-2 top-1/2 -translate-y-1/2"
              onClick={() => go(-1)}
            >
              <ChevronLeft />
            </IconButton>
            <IconButton
              label="Next image"
              size="sm"
              variant="secondary"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => go(1)}
            >
              <ChevronRight />
            </IconButton>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-black/40 px-2 py-1">
              {items.map((item, i) => (
                <button
                  key={item.url}
                  type="button"
                  aria-label={`Image ${i + 1} of ${items.length}`}
                  aria-current={i === index || undefined}
                  onClick={() => setIndex(i)}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === index ? 'w-4 bg-accent' : 'w-1.5 bg-white/40 hover:bg-white/70'
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>
      {(current.title || current.description) && (
        <figcaption className="px-3 py-2 text-xs">
          {current.title && <span className="font-medium text-fg">{current.title}</span>}
          {current.title && current.description && <span className="text-fg-subtle"> · </span>}
          {current.description && <span className="text-fg-muted">{current.description}</span>}
        </figcaption>
      )}
    </figure>
  )
}

function ProjectSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="flex gap-4">
        <Skeleton className="size-[72px] rounded-[16px]" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-full" />
        ))}
      </div>
      <Skeleton className="aspect-video w-full rounded-[14px]" />
      <SkeletonText lines={6} />
    </div>
  )
}

function ProjectBody({
  project,
  author,
  view,
  busy,
  flow
}: {
  project: ModrinthProject
  author: string | null
  view: InstanceModsView
  busy: boolean
  flow: InstallFlow
}) {
  const versions = useModrinthVersions(project.id, view.minecraftVersion)
  const state = hitState({ projectId: project.id, slug: project.slug }, view)
  const installed = useMemo(() => installedVersionIds(view), [view])
  const gallery = useMemo(() => sortGallery(project.gallery), [project.gallery])
  const compatible = useMemo(
    () => versionsForGame(versions.data ?? [], view.minecraftVersion),
    [versions.data, view.minecraftVersion]
  )
  const installing = flow.inFlight.has(project.id)

  const links = [
    { label: 'Source', url: project.sourceUrl, icon: <Code /> },
    { label: 'Issues', url: project.issuesUrl, icon: <Bug /> },
    { label: 'Wiki', url: project.wikiUrl, icon: <BookOpen /> },
    { label: 'Discord', url: project.discordUrl, icon: <MessageCircle /> }
  ].filter((l): l is { label: string; url: string; icon: JSX.Element } => !!l.url)

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <ModIcon src={project.iconUrl} name={project.title} size={72} className="rounded-[16px]" />
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-semibold tracking-tight text-fg">{project.title}</h3>
          {author && <div className="text-xs text-fg-subtle">by {author}</div>}
          <p className="mt-1.5 text-sm leading-snug text-fg-muted">{project.description}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-fg-subtle">
            <span className="flex items-center gap-1 tabular-nums">
              <Download className="size-3" aria-hidden />
              {formatCount(project.downloads)} downloads
            </span>
            <span className="flex items-center gap-1 tabular-nums">
              <Heart className="size-3" aria-hidden />
              {formatCount(project.followers)} followers
            </span>
            <span>Updated {formatRelative(project.updated)}</span>
            <span>Published {formatDate(project.published)}</span>
            {project.license && <span>{project.license.name || project.license.id}</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...project.categories, ...project.additionalCategories].map((c) => (
              <Badge key={c} size="sm" tone="neutral">
                {categoryLabel(c)}
              </Badge>
            ))}
          </div>
        </div>
        <div className="shrink-0">
          <InstallStateControl
            state={state}
            conflictReason={conflictReasonForSlug(project.slug, view.manifest)}
            installing={installing}
            busy={busy}
            onInstall={() => void flow.start({ projectId: project.id, title: project.title })}
          />
        </div>
      </header>

      {links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {links.map((l) => (
            <Button
              key={l.label}
              size="sm"
              variant="outline"
              leftIcon={l.icon}
              rightIcon={<ExternalLink />}
              onClick={() => openExternal(l.url)}
            >
              {l.label}
            </Button>
          ))}
        </div>
      )}

      {gallery.length > 0 && <GalleryCarousel items={gallery} />}

      <section>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
          Versions for Minecraft {view.minecraftVersion}
        </h4>
        {versions.isLoading ? (
          <div className="divide-y divide-line rounded-[12px] border border-line" aria-hidden>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-7 w-20" />
              </div>
            ))}
          </div>
        ) : versions.isError ? (
          <ErrorCard
            error={versions.error}
            onRetry={() => void versions.refetch()}
            retrying={versions.isFetching}
          />
        ) : compatible.length === 0 ? (
          <div className="rounded-[12px] border border-line px-3 py-4 text-sm text-fg-muted">
            No Fabric build of {project.title} for Minecraft {view.minecraftVersion} yet.
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-[12px] border border-line">
            {compatible.map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-[13px] text-fg">
                      {v.versionNumber}
                    </span>
                    <Badge size="sm" tone={VERSION_TONES[v.versionType]}>
                      {v.versionType}
                    </Badge>
                  </div>
                  <div className="truncate text-xs text-fg-subtle">
                    {v.name} · {formatDate(v.datePublished)} · {formatCount(v.downloads)} downloads
                  </div>
                </div>
                {installed.has(v.id) ? (
                  <Button size="xs" variant="secondary" leftIcon={<Check />} disabled>
                    Installed
                  </Button>
                ) : state === 'install' || state === 'installed' ? (
                  <BusyGuard busy={busy}>
                    <Button
                      size="xs"
                      variant="outline"
                      leftIcon={<Download />}
                      loading={installing}
                      disabled={busy}
                      onClick={() =>
                        void flow.start({
                          projectId: project.id,
                          versionId: v.id,
                          title: project.title
                        })
                      }
                    >
                      Install
                    </Button>
                  </BusyGuard>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {project.body.trim().length > 0 && (
        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
            About
          </h4>
          <div className="prose-shard selectable text-sm">
            <Markdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
              {project.body}
            </Markdown>
          </div>
        </section>
      )}
    </div>
  )
}

export function ModrinthProjectPanel({
  idOrSlug,
  author,
  view,
  busy,
  flow,
  onBack
}: ModrinthProjectPanelProps) {
  const project = useModrinthProject(idOrSlug)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-5 py-2.5">
        <Button size="sm" variant="ghost" leftIcon={<ArrowLeft />} onClick={onBack} data-autofocus>
          Back to results
        </Button>
        {project.data && (
          <Button
            size="sm"
            variant="ghost"
            rightIcon={<ExternalLink />}
            className="ml-auto"
            onClick={() => openExternal(modrinthModUrl(project.data.slug))}
          >
            Open on Modrinth
          </Button>
        )}
      </div>
      <div className="scroll-area min-h-0 flex-1 px-5 py-5">
        {project.isLoading ? (
          <ProjectSkeleton />
        ) : project.isError || !project.data ? (
          <ErrorCard
            error={project.error}
            onRetry={() => void project.refetch()}
            retrying={project.isFetching}
          />
        ) : (
          <ProjectBody project={project.data} author={author} view={view} busy={busy} flow={flow} />
        )}
      </div>
    </div>
  )
}
