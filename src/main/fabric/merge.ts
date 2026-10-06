/**
 * Merges a Fabric profile JSON (which `inheritsFrom` a vanilla version) with the vanilla
 * version JSON into one self-contained version. Pure so it is unit tested directly.
 */
import { type Library, type VersionJson } from '@shared/schemas/mojang'

/**
 * De-duplication key for a Maven coordinate: `group:artifact` plus the classifier when
 * present. Classifier variants (lwjgl natives jars) are distinct artifacts that must all stay
 * on the classpath, so they cannot share a key with the main jar.
 */
export function libraryKey(name: string): string {
  const [coords] = name.split('@', 2)
  const parts = (coords ?? name).split(':')
  const base = `${parts[0] ?? ''}:${parts[1] ?? ''}`
  return parts.length > 3 ? `${base}:${parts.slice(3).join(':')}` : base
}

/** Keeps the first library seen for every key, so `primary` wins over `secondary`. */
export function mergeLibraries(primary: readonly Library[], secondary: readonly Library[]): Library[] {
  const seen = new Set<string>()
  const out: Library[] = []
  for (const lib of [...primary, ...secondary]) {
    const key = libraryKey(lib.name)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(lib)
  }
  return out
}

export function mergeProfiles(vanilla: VersionJson, fabric: VersionJson): VersionJson {
  const merged: VersionJson = {
    ...vanilla,
    id: fabric.id,
    inheritsFrom: vanilla.id,
    mainClass: fabric.mainClass,
    libraries: mergeLibraries(fabric.libraries, vanilla.libraries)
  }
  if (vanilla.arguments || fabric.arguments) {
    merged.arguments = {
      jvm: [...(vanilla.arguments?.jvm ?? []), ...(fabric.arguments?.jvm ?? [])],
      game: [...(vanilla.arguments?.game ?? []), ...(fabric.arguments?.game ?? [])]
    }
  }
  return merged
}
