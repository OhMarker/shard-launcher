/** Pure helpers for mod file names: `.jar` <-> `.jar.disabled`, Shard client jar detection. */

export const JAR_EXT = '.jar'
export const DISABLED_SUFFIX = '.disabled'
export const DISABLED_JAR_EXT = `${JAR_EXT}${DISABLED_SUFFIX}`
export const MODS_DIR = 'mods'

export function isJarName(name: string): boolean {
  return name.toLowerCase().endsWith(JAR_EXT)
}

export function isDisabledJarName(name: string): boolean {
  return name.toLowerCase().endsWith(DISABLED_JAR_EXT)
}

/** True for anything the scanner treats as a mod file. */
export function isModFileName(name: string): boolean {
  return isJarName(name) || isDisabledJarName(name)
}

/** The `.jar` name a file is indexed under, whether or not it is currently disabled. */
export function canonicalJarName(name: string): string {
  return isDisabledJarName(name) ? name.slice(0, -DISABLED_SUFFIX.length) : name
}

export function disabledJarName(name: string): string {
  return `${canonicalJarName(name)}${DISABLED_SUFFIX}`
}

/** The on-disk name for the given enabled state. */
export function fileNameFor(name: string, enabled: boolean): string {
  return enabled ? canonicalJarName(name) : disabledJarName(name)
}

/** Jars installed by the Shard client service (`shard-<build>.jar`). */
export function isShardJarName(name: string): boolean {
  return /^shard-.+\.jar$/i.test(canonicalJarName(name))
}

/** Human-readable fallback when a jar has no metadata. */
export function modDisplayName(name: string): string {
  return canonicalJarName(name).replace(/\.jar$/i, '')
}

/** Rejects anything that could escape the mods folder. */
export function isSafeFileName(name: string): boolean {
  return name.length > 0 && name !== '.' && name !== '..' && !/[\\/\0]/.test(name)
}
