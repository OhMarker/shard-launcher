import { z } from 'zod'
import { COSMETIC_RARITIES, COSMETIC_TYPES } from '../types/cosmetics'

// ---------------------------------------------------------------------------
// shard-manifest.json (hosted). See CONTRACT.md.
// ---------------------------------------------------------------------------

export const ShardBuildSchema = z.object({
  version: z.string(),
  minecraft: z.array(z.string()).min(1),
  fabricLoader: z.string().default('*'),
  url: z.string(),
  sha512: z.string().regex(/^[a-fA-F0-9]{128}$/, 'sha512 must be 128 hex characters'),
  changelog: z.string().default(''),
  releasedAt: z.string()
})

export const ShardManifestSchema = z.object({
  latest: z.string(),
  builds: z.array(ShardBuildSchema)
})
export type ShardManifestPayload = z.infer<typeof ShardManifestSchema>

// ---------------------------------------------------------------------------
// bundled-mods.json (shipped in the launcher and optionally hosted)
// ---------------------------------------------------------------------------

export const BundledModDefSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  required: z.boolean().default(false),
  locked: z.boolean().default(true),
  description: z.string().default(''),
  configFiles: z.array(z.string()).default([])
})

export const BundledModsManifestSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string(),
  mods: z.array(BundledModDefSchema).min(1),
  sharedFiles: z.array(z.string()).default([]),
  conflicts: z.array(z.object({ slug: z.string(), reason: z.string().default('') })).default([])
})
export type BundledModsManifestPayload = z.infer<typeof BundledModsManifestSchema>

// ---------------------------------------------------------------------------
// cosmetics.json
// ---------------------------------------------------------------------------

/**
 * One catalogue entry. `textureUrl` may be null only for bundles (they render nothing); bundles
 * list the ids they give in `items`.
 */
export const CosmeticSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(COSMETIC_TYPES as [string, ...string[]]),
    name: z.string().min(1),
    rarity: z.enum(COSMETIC_RARITIES as [string, ...string[]]),
    textureUrl: z.string().nullable(),
    previewUrl: z.string().nullable().default(null),
    animated: z.boolean().default(false),
    author: z.string().default('Shard'),
    description: z.string().nullable().default(null),
    availability: z.enum(['free', 'locked']).default('free'),
    tags: z.array(z.string()).default([]),
    items: z.array(z.string().min(1)).optional()
  })
  .refine((c) => c.type === 'bundle' || c.textureUrl !== null, {
    message: 'Only bundles may have no texture',
    path: ['textureUrl']
  })
  .refine((c) => c.type !== 'bundle' || (c.items?.length ?? 0) > 0, {
    message: 'A bundle lists its items',
    path: ['items']
  })
export type CosmeticPayload = z.infer<typeof CosmeticSchema>

/**
 * cosmetics.json (schemaVersion 1) and cosmetics-v2.json (2). Entries are checked one by one in
 * parseCosmeticEntries, so a type or field this launcher does not know (added for a newer
 * launcher) skips that entry instead of failing the whole catalogue.
 */
export const CosmeticsManifestSchema = z.object({
  schemaVersion: z.number().int().min(1),
  updatedAt: z.string(),
  cosmetics: z.array(z.unknown())
})

/** Valid entries in file order, first one wins for a repeated id; `skipped` counts the rest. */
export function parseCosmeticEntries(entries: readonly unknown[]): {
  cosmetics: CosmeticPayload[]
  skipped: number
} {
  const cosmetics: CosmeticPayload[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    const parsed = CosmeticSchema.safeParse(entry)
    if (!parsed.success || seen.has(parsed.data.id)) continue
    seen.add(parsed.data.id)
    cosmetics.push(parsed.data)
  }
  return { cosmetics, skipped: entries.length - cosmetics.length }
}
export type CosmeticsManifestPayload = z.infer<typeof CosmeticsManifestSchema>

// ---------------------------------------------------------------------------
// equipped.json
// ---------------------------------------------------------------------------

export const EquippedCosmeticsSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string(),
  accountId: z.string().nullable(),
  equipped: z.record(z.string(), z.string()),
  emotes: z.array(z.string()).default([])
})

// ---------------------------------------------------------------------------
// launcher-info.json
// ---------------------------------------------------------------------------

export const LauncherInfoSchema = z.object({
  schemaVersion: z.literal(1),
  launcherVersion: z.string(),
  accountId: z.string().nullable(),
  username: z.string().nullable(),
  minecraftVersion: z.string(),
  instanceId: z.string(),
  instanceName: z.string(),
  shardBuild: z.string().nullable(),
  accent: z.string(),
  theme: z.enum(['dark', 'light']),
  equippedPath: z.string(),
  sharedConfigPath: z.string().nullable(),
  accountBridge: z
    .object({
      url: z.string().regex(/^http:\/\/127\.0\.0\.1:\d{1,5}$/),
      secret: z.string().regex(/^[0-9a-f]{64}$/)
    })
    .optional(),
  writtenAt: z.string()
})
