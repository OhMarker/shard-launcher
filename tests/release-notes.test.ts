import { describe, expect, it, vi } from 'vitest'
import type { ReleaseNote, ShardBuild } from '@shared/types'

// tsconfig.node.json is a composite project that does not list renderer files, so the
// module is loaded at runtime and typed by hand instead of being imported statically.
interface ReleaseNotesModule {
  normalizeVersion(tag: string): string
  findReleaseNote(notes: readonly ReleaseNote[] | undefined, version: string | undefined): ReleaseNote | null
  excerptMarkdown(body: string, maxLines?: number, maxChars?: number): { text: string; truncated: boolean }
  sortBuildsNewestFirst(builds: readonly ShardBuild[]): ShardBuild[]
}
const { excerptMarkdown, findReleaseNote, normalizeVersion, sortBuildsNewestFirst } =
  await vi.importActual<ReleaseNotesModule>('../src/renderer/src/pages/updates/release-notes')

const note = (tag: string): ReleaseNote => ({
  tag,
  name: tag,
  body: '',
  publishedAt: '2026-01-01T00:00:00Z',
  url: `https://example.invalid/${tag}`,
  prerelease: false
})

const build = (version: string, releasedAt: string): ShardBuild => ({
  version,
  minecraft: ['1.21.4'],
  fabricLoader: '>=0.16',
  url: 'https://example.invalid/shard.jar',
  sha512: '0',
  changelog: '',
  releasedAt
})

describe('normalizeVersion / findReleaseNote', () => {
  it('ignores a leading v and surrounding whitespace', () => {
    expect(normalizeVersion(' v1.2.3 ')).toBe('1.2.3')
    expect(normalizeVersion('V0.1.0')).toBe('0.1.0')
    expect(normalizeVersion('1.0.0')).toBe('1.0.0')
  })

  it('matches tags against the package version in either form', () => {
    const notes = [note('v0.2.0'), note('v0.1.0')]
    expect(findReleaseNote(notes, '0.1.0')?.tag).toBe('v0.1.0')
    expect(findReleaseNote(notes, 'v0.2.0')?.tag).toBe('v0.2.0')
    expect(findReleaseNote(notes, '9.9.9')).toBeNull()
    expect(findReleaseNote(undefined, '0.1.0')).toBeNull()
    expect(findReleaseNote(notes, undefined)).toBeNull()
  })
})

describe('excerptMarkdown', () => {
  it('keeps short bodies whole', () => {
    expect(excerptMarkdown('\n\n## Fixes\n- one\n- two\n')).toEqual({ text: '## Fixes\n- one\n- two', truncated: false })
  })

  it('cuts on line boundaries by line count or character budget', () => {
    const body = Array.from({ length: 10 }, (_, i) => `- item ${i}`).join('\n')
    expect(excerptMarkdown(body, 3)).toEqual({ text: '- item 0\n- item 1\n- item 2', truncated: true })
    expect(excerptMarkdown('short\n' + 'x'.repeat(500), 6, 100)).toEqual({ text: 'short', truncated: true })
  })

  it('normalises Windows line endings', () => {
    expect(excerptMarkdown('a\r\nb', 1)).toEqual({ text: 'a', truncated: true })
  })
})

describe('sortBuildsNewestFirst', () => {
  it('orders by release date, keeping manifest order for ties and unparseable dates', () => {
    const builds = [build('1.0.0', '2026-01-01T00:00:00Z'), build('1.2.0', '2026-03-01T00:00:00Z'), build('1.1.0', '2026-02-01T00:00:00Z'), build('0.9.0', 'not a date')]
    expect(sortBuildsNewestFirst(builds).map((b) => b.version)).toEqual(['1.2.0', '1.1.0', '1.0.0', '0.9.0'])
    expect(builds.map((b) => b.version)).toEqual(['1.0.0', '1.2.0', '1.1.0', '0.9.0'])
  })
})
