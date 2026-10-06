import { z } from 'zod'

export const ModrinthSearchHitSchema = z.object({
  project_id: z.string(),
  project_type: z.string().optional(),
  slug: z.string(),
  author: z.string().default(''),
  title: z.string(),
  description: z.string().default(''),
  categories: z.array(z.string()).default([]),
  display_categories: z.array(z.string()).default([]),
  versions: z.array(z.string()).default([]),
  downloads: z.number().default(0),
  follows: z.number().default(0),
  icon_url: z.string().nullable().optional(),
  date_created: z.string(),
  date_modified: z.string(),
  latest_version: z.string().nullable().optional(),
  license: z.string().nullable().optional(),
  client_side: z.string().default('unknown'),
  server_side: z.string().default('unknown'),
  gallery: z.array(z.string()).optional(),
  featured_gallery: z.string().nullable().optional()
})

export const ModrinthSearchResponseSchema = z.object({
  hits: z.array(ModrinthSearchHitSchema),
  offset: z.number(),
  limit: z.number(),
  total_hits: z.number()
})
export type ModrinthSearchResponse = z.infer<typeof ModrinthSearchResponseSchema>

export const ModrinthProjectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  project_type: z.string().optional(),
  team: z.string().optional(),
  title: z.string(),
  description: z.string().default(''),
  body: z.string().default(''),
  published: z.string(),
  updated: z.string(),
  status: z.string().optional(),
  client_side: z.string().default('unknown'),
  server_side: z.string().default('unknown'),
  downloads: z.number().default(0),
  followers: z.number().default(0),
  categories: z.array(z.string()).default([]),
  additional_categories: z.array(z.string()).default([]),
  game_versions: z.array(z.string()).default([]),
  loaders: z.array(z.string()).default([]),
  versions: z.array(z.string()).default([]),
  icon_url: z.string().nullable().optional(),
  issues_url: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
  wiki_url: z.string().nullable().optional(),
  discord_url: z.string().nullable().optional(),
  license: z
    .object({
      id: z.string(),
      name: z.string(),
      url: z.string().nullable().optional()
    })
    .nullable()
    .optional(),
  gallery: z
    .array(
      z.object({
        url: z.string(),
        featured: z.boolean().default(false),
        title: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        created: z.string().optional(),
        ordering: z.number().optional()
      })
    )
    .default([])
})
export type ModrinthProjectResponse = z.infer<typeof ModrinthProjectSchema>

export const ModrinthProjectListSchema = z.array(ModrinthProjectSchema)

export const ModrinthVersionFileSchema = z.object({
  hashes: z.object({
    sha512: z.string(),
    sha1: z.string().optional()
  }),
  url: z.string(),
  filename: z.string(),
  primary: z.boolean().default(false),
  size: z.number().default(0),
  file_type: z.string().nullable().optional()
})

export const ModrinthDependencySchema = z.object({
  version_id: z.string().nullable().optional(),
  project_id: z.string().nullable().optional(),
  file_name: z.string().nullable().optional(),
  dependency_type: z.enum(['required', 'optional', 'incompatible', 'embedded'])
})

export const ModrinthVersionSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  author_id: z.string().optional(),
  name: z.string(),
  version_number: z.string(),
  changelog: z.string().nullable().optional(),
  date_published: z.string(),
  downloads: z.number().default(0),
  version_type: z.enum(['release', 'beta', 'alpha']),
  status: z.string().optional(),
  featured: z.boolean().optional(),
  game_versions: z.array(z.string()).default([]),
  loaders: z.array(z.string()).default([]),
  files: z.array(ModrinthVersionFileSchema),
  dependencies: z.array(ModrinthDependencySchema).default([])
})
export type ModrinthVersionResponse = z.infer<typeof ModrinthVersionSchema>

export const ModrinthVersionListSchema = z.array(ModrinthVersionSchema)

/** POST /version_files and POST /version_files/update: hash -> version */
export const ModrinthVersionMapSchema = z.record(z.string(), ModrinthVersionSchema)

export const ModrinthCategorySchema = z.object({
  icon: z.string().optional(),
  name: z.string(),
  project_type: z.string(),
  header: z.string().optional()
})
export const ModrinthCategoryListSchema = z.array(ModrinthCategorySchema)

/** modrinth.index.json inside an .mrpack */
export const MrpackIndexSchema = z.object({
  formatVersion: z.number(),
  game: z.string(),
  versionId: z.string(),
  name: z.string(),
  summary: z.string().optional(),
  files: z.array(
    z.object({
      path: z.string(),
      hashes: z.object({ sha1: z.string().optional(), sha512: z.string() }),
      env: z
        .object({
          client: z.enum(['required', 'optional', 'unsupported']).optional(),
          server: z.enum(['required', 'optional', 'unsupported']).optional()
        })
        .optional(),
      downloads: z.array(z.string()),
      fileSize: z.number().optional()
    })
  ),
  dependencies: z.record(z.string(), z.string())
})
export type MrpackIndex = z.infer<typeof MrpackIndexSchema>

/** fabric.mod.json inside a mod jar. Only the fields the launcher displays. */
export const FabricModJsonSchema = z.object({
  schemaVersion: z.number().optional(),
  id: z.string(),
  version: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  icon: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
  authors: z.array(z.union([z.string(), z.object({ name: z.string() })])).optional(),
  depends: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional()
})
export type FabricModJson = z.infer<typeof FabricModJsonSchema>
