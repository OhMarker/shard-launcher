import AdmZip from 'adm-zip'
import { FabricModJsonSchema } from '@shared/schemas/modrinth'
import type { FabricModMeta } from '@shared/types'

const FABRIC_MOD_JSON = 'fabric.mod.json'

/**
 * Fabric's own parser accepts raw newlines inside strings, which strict JSON rejects.
 * Escapes control characters that appear inside string literals so JSON.parse can cope.
 */
export function escapeControlCharsInStrings(text: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (const ch of text) {
    if (inString) {
      if (escaped) {
        escaped = false
        out += ch
        continue
      }
      if (ch === '\\') {
        escaped = true
        out += ch
        continue
      }
      if (ch === '"') {
        inString = false
        out += ch
        continue
      }
      if (ch === '\n') out += '\\n'
      else if (ch === '\r') out += '\\r'
      else if (ch === '\t') out += '\\t'
      else out += ch
      continue
    }
    if (ch === '"') inString = true
    out += ch
  }
  return out
}

/** Parses fabric.mod.json text; null when unreadable or missing required fields. */
export function parseFabricModJson(text: string): FabricModMeta | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    try {
      raw = JSON.parse(escapeControlCharsInStrings(text))
    } catch {
      return null
    }
  }
  const parsed = FabricModJsonSchema.safeParse(raw)
  if (!parsed.success) return null
  return {
    id: parsed.data.id,
    name: parsed.data.name ?? parsed.data.id,
    version: parsed.data.version,
    description: parsed.data.description ?? null
  }
}

/** Reads fabric.mod.json out of a mod jar. Tolerates non-zip files and missing entries. */
export async function readFabricModJson(jarPath: string): Promise<FabricModMeta | null> {
  try {
    const zip = new AdmZip(jarPath)
    const entry = zip.getEntry(FABRIC_MOD_JSON)
    if (!entry || entry.isDirectory) return null
    return parseFabricModJson(entry.getData().toString('utf8'))
  } catch {
    return null
  }
}
