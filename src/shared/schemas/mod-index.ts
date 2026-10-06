import { z } from 'zod'

// ---------------------------------------------------------------------------
// <instance>/.shard/mods.json: metadata for every jar in the instance's mods folder.
// Keys are the canonical jar name (without a trailing ".disabled").
// ---------------------------------------------------------------------------

export const ModIndexSourceSchema = z.enum(['bundled', 'shard', 'modrinth', 'local'])

/** A newer Modrinth version found by the last update check, ready to download. */
export const ModIndexUpdateSchema = z.object({
  versionId: z.string(),
  versionNumber: z.string(),
  fileName: z.string(),
  url: z.string(),
  sha512: z.string(),
  size: z.number(),
  changelog: z.string().nullable().default(null),
  datePublished: z.string()
})
export type ModIndexUpdate = z.infer<typeof ModIndexUpdateSchema>

/** fabric.mod.json fields cached so the jar is only opened once. null = no readable fabric.mod.json. */
export const ModIndexFabricSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string().nullable().default(null)
})

export const ModIndexEntrySchema = z.object({
  source: ModIndexSourceSchema,
  slug: z.string().optional(),
  projectId: z.string().optional(),
  versionId: z.string().optional(),
  versionNumber: z.string().optional(),
  title: z.string().optional(),
  iconUrl: z.string().optional(),
  author: z.string().optional(),
  sha512: z.string(),
  size: z.number(),
  mtimeMs: z.number(),
  installedAt: z.string(),
  /** Set once Modrinth has been asked about this hash (found or not). Missing = retry on the next scan. */
  identifiedAt: z.string().optional(),
  fabric: ModIndexFabricSchema.nullable().optional(),
  update: ModIndexUpdateSchema.nullable().optional()
})
export type ModIndexEntry = z.infer<typeof ModIndexEntrySchema>

export const ModIndexSchema = z.object({
  version: z.literal(1),
  files: z.record(z.string(), ModIndexEntrySchema).default({}),
  /** Bundled slugs that had no compatible build at the last sync. */
  waiting: z.array(z.string()).default([])
})
export type ModIndex = z.infer<typeof ModIndexSchema>

// ---------------------------------------------------------------------------
// cache/bundled-projects.json: slug -> Modrinth project info for the bundled set.
// ---------------------------------------------------------------------------

export const BundledProjectInfoSchema = z.object({
  projectId: z.string(),
  title: z.string(),
  iconUrl: z.string().nullable().default(null)
})
export type BundledProjectInfo = z.infer<typeof BundledProjectInfoSchema>

export const BundledProjectsCacheSchema = z.object({
  version: z.literal(1),
  fetchedAt: z.string(),
  projects: z.record(z.string(), BundledProjectInfoSchema)
})
export type BundledProjectsCache = z.infer<typeof BundledProjectsCacheSchema>
