import { type ModrinthVersion } from '@shared/types'

const PRERELEASE_RE = /(^|[^a-z])(alpha|beta|rc|pre|snapshot|dev|nightly|experimental)([^a-z]|$)/i

/** Heuristic for version numbers like `mc26.3-0.9.3-alpha.1-fabric` or `1.2.0-beta.4`. */
export function isPrereleaseNumber(versionNumber: string | null | undefined): boolean {
  return typeof versionNumber === 'string' && PRERELEASE_RE.test(versionNumber)
}

/**
 * Modrinth's update endpoint returns the newest matching version regardless of channel. An
 * automatic update must never move a mod from a release build onto an alpha/beta: that is
 * exactly how Sodium 0.9.3-alpha.1 broke Reese's Sodium Options' hard dependency during
 * verification. Prerelease installs may follow prereleases.
 */
export function acceptsUpdate(installedVersionNumber: string | null | undefined, next: ModrinthVersion): boolean {
  if (next.versionType === 'release') return true
  return isPrereleaseNumber(installedVersionNumber)
}
