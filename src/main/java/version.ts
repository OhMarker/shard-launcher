/** Java version string parsing. Pure so it is unit tested directly. */

const VERSION_LINE_RE = /version\s+"([^"]+)"/

/**
 * Major version from a Java version name. Handles the modern scheme ("21.0.3" -> 21,
 * "17.0.9" -> 17, "21-ea" -> 21), the legacy scheme ("1.8.0_392" -> 8) and Mojang's
 * runtime names ("8u51-cacert462b08" -> 8). Returns null for anything unparseable.
 */
export function majorFromVersionName(name: string): number | null {
  const match = /^(\d+)(?:[._](\d+))?/.exec(name.trim())
  if (!match?.[1]) return null
  const first = Number(match[1])
  if (first === 1) return match[2] !== undefined ? Number(match[2]) : null
  return first
}

export interface ParsedJavaVersion {
  version: string
  major: number
}

/** Parses the output of `java -version` (which Java prints on stderr). */
export function parseJavaVersion(output: string): ParsedJavaVersion | null {
  const match = VERSION_LINE_RE.exec(output)
  if (!match?.[1]) return null
  const version = match[1]
  const major = majorFromVersionName(version)
  return major === null ? null : { version, major }
}
