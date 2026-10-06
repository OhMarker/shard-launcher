import { type ReleaseNote, type ShardBuild } from '@shared/types'

/** GitHub tags are usually `v1.2.3`; package versions are `1.2.3`. Compare without the prefix. */
export function normalizeVersion(tag: string): string {
  return tag.trim().replace(/^v/i, '')
}

export function findReleaseNote(
  notes: readonly ReleaseNote[] | undefined,
  version: string | undefined
): ReleaseNote | null {
  if (!notes || !version) return null
  const wanted = normalizeVersion(version)
  return notes.find((n) => normalizeVersion(n.tag) === wanted) ?? null
}

export interface MarkdownExcerpt {
  text: string
  truncated: boolean
}

/** First lines of a markdown body for a preview card; cuts on line boundaries. */
export function excerptMarkdown(body: string, maxLines = 6, maxChars = 420): MarkdownExcerpt {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  let start = 0
  while (start < lines.length && lines[start]!.trim() === '') start++
  const kept: string[] = []
  let chars = 0
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!
    if (kept.length >= maxLines || chars + line.length > maxChars) {
      return { text: kept.join('\n').trimEnd(), truncated: true }
    }
    kept.push(line)
    chars += line.length + 1
  }
  return { text: kept.join('\n').trimEnd(), truncated: false }
}

export function sortBuildsNewestFirst(builds: readonly ShardBuild[]): ShardBuild[] {
  return builds
    .map((build, index) => ({ build, index, t: Date.parse(build.releasedAt) }))
    .sort((a, b) => {
      const at = Number.isFinite(a.t) ? a.t : -Infinity
      const bt = Number.isFinite(b.t) ? b.t : -Infinity
      return bt - at || a.index - b.index
    })
    .map((x) => x.build)
}
