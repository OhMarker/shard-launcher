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

export const CosmeticSchema = z.object({
  id: z.string().min(1),
  type: z.enum(COSMETIC_TYPES as [string, ...string[]]),
  name: z.string().min(1),
  rarity: z.enum(COSMETIC_RARITIES as [string, ...string[]]),
  textureUrl: z.string(),
  previewUrl: z.string().nullable().default(null),
  animated: z.boolean().default(false),
  author: z.string().default('Shard'),
  description: z.string().nullable().default(null),
  availability: z.enum(['free', 'locked']).default('free'),
  tags: z.array(z.string()).default([])
})

export const CosmeticsManifestSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string(),
  cosmetics: z.array(CosmeticSchema)
})
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
