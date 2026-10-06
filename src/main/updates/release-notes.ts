/** Pure mapping from GitHub releases / electron-updater metadata to renderer-facing release notes. */
import { type GitHubRelease } from '@shared/schemas/misc'
import { type ReleaseNote } from '@shared/types'

/** Shape of one entry when electron-updater reports `releaseNotes` as a list (fullChangelog). */
export interface ReleaseNoteFragment {
  version: string
  note: string | null
}

/** Drafts are hidden; a release without a name falls back to its tag, a null body becomes ''. */
export function mapReleaseNotes(releases: readonly GitHubRelease[]): ReleaseNote[] {
  return releases
    .filter((release) => !release.draft)
    .map((release) => ({
      tag: release.tag_name,
      name: release.name?.trim() || release.tag_name,
      body: release.body ?? '',
      publishedAt: release.published_at ?? '',
      url: release.html_url,
      prerelease: release.prerelease
    }))
}

/** Flattens electron-updater's `releaseNotes` (string or per-version list) into one markdown string. */
export function releaseNotesText(
  notes: string | readonly ReleaseNoteFragment[] | null | undefined
): string | null {
  if (notes === null || notes === undefined) return null
  if (typeof notes === 'string') return notes.trim() || null
  const sections = notes.flatMap((fragment) => {
    const note = fragment.note?.trim()
    return note ? [`## ${fragment.version}\n\n${note}`] : []
  })
  return sections.length ? sections.join('\n\n') : null
}
