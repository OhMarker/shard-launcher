import { z } from 'zod'

// ---------------------------------------------------------------------------
// version_manifest_v2.json
// ---------------------------------------------------------------------------

export const ManifestVersionSchema = z.object({
  id: z.string(),
  type: z.string(),
  url: z.string(),
  time: z.string(),
  releaseTime: z.string(),
  sha1: z.string(),
  complianceLevel: z.number().optional()
})
export type ManifestVersion = z.infer<typeof ManifestVersionSchema>

export const VersionManifestSchema = z.object({
  latest: z.object({ release: z.string(), snapshot: z.string() }),
  versions: z.array(ManifestVersionSchema)
})
export type VersionManifest = z.infer<typeof VersionManifestSchema>

// ---------------------------------------------------------------------------
// <version>.json (also used for the Fabric profile JSON, which inherits)
// ---------------------------------------------------------------------------

export const RuleSchema = z.object({
  action: z.enum(['allow', 'disallow']),
  os: z
    .object({
      name: z.string().optional(),
      arch: z.string().optional(),
      version: z.string().optional()
    })
    .optional(),
  features: z.record(z.string(), z.boolean()).optional()
})
export type Rule = z.infer<typeof RuleSchema>

export const ArgumentSchema = z.union([
  z.string(),
  z.object({
    rules: z.array(RuleSchema),
    value: z.union([z.string(), z.array(z.string())])
  })
])
export type Argument = z.infer<typeof ArgumentSchema>

export const DownloadInfoSchema = z.object({
  sha1: z.string(),
  size: z.number(),
  url: z.string(),
  path: z.string().optional()
})
export type DownloadInfo = z.infer<typeof DownloadInfoSchema>

export const LibrarySchema = z.object({
  name: z.string(),
  downloads: z
    .object({
      artifact: DownloadInfoSchema.optional(),
      classifiers: z.record(z.string(), DownloadInfoSchema).optional()
    })
    .optional(),
  /** Maven repository base URL (Fabric meta style). */
  url: z.string().optional(),
  sha1: z.string().optional(),
  size: z.number().optional(),
  rules: z.array(RuleSchema).optional(),
  natives: z.record(z.string(), z.string()).optional(),
  extract: z.object({ exclude: z.array(z.string()).optional() }).optional()
})
export type Library = z.infer<typeof LibrarySchema>

export const AssetIndexRefSchema = z.object({
  id: z.string(),
  sha1: z.string(),
  size: z.number(),
  totalSize: z.number().optional(),
  url: z.string()
})

export const VersionJsonSchema = z.object({
  id: z.string(),
  inheritsFrom: z.string().optional(),
  type: z.string(),
  time: z.string().optional(),
  releaseTime: z.string().optional(),
  mainClass: z.string(),
  minimumLauncherVersion: z.number().optional(),
  arguments: z
    .object({
      game: z.array(ArgumentSchema).optional(),
      jvm: z.array(ArgumentSchema).optional()
    })
    .optional(),
  minecraftArguments: z.string().optional(),
  assetIndex: AssetIndexRefSchema.optional(),
  assets: z.string().optional(),
  complianceLevel: z.number().optional(),
  downloads: z
    .object({
      client: DownloadInfoSchema.optional(),
      server: DownloadInfoSchema.optional(),
      client_mappings: DownloadInfoSchema.optional(),
      server_mappings: DownloadInfoSchema.optional()
    })
    .optional(),
  javaVersion: z
    .object({
      component: z.string(),
      majorVersion: z.number()
    })
    .optional(),
  libraries: z.array(LibrarySchema),
  logging: z
    .object({
      client: z
        .object({
          argument: z.string(),
          file: DownloadInfoSchema.extend({ id: z.string() }),
          type: z.string()
        })
        .optional()
    })
    .optional()
})
export type VersionJson = z.infer<typeof VersionJsonSchema>

// ---------------------------------------------------------------------------
// Asset index
// ---------------------------------------------------------------------------

export const AssetIndexSchema = z.object({
  objects: z.record(z.string(), z.object({ hash: z.string(), size: z.number() })),
  virtual: z.boolean().optional(),
  map_to_resources: z.boolean().optional()
})
export type AssetIndex = z.infer<typeof AssetIndexSchema>

// ---------------------------------------------------------------------------
// Java runtime manifests
// ---------------------------------------------------------------------------

export const JavaRuntimeEntrySchema = z.object({
  availability: z.object({ group: z.number(), progress: z.number() }).optional(),
  manifest: DownloadInfoSchema,
  version: z.object({ name: z.string(), released: z.string() })
})
export type JavaRuntimeEntry = z.infer<typeof JavaRuntimeEntrySchema>

/** platform -> component -> entries */
export const JavaRuntimeAllSchema = z.record(
  z.string(),
  z.record(z.string(), z.array(JavaRuntimeEntrySchema))
)
export type JavaRuntimeAll = z.infer<typeof JavaRuntimeAllSchema>

export const JavaRuntimeFileSchema = z.object({
  type: z.enum(['file', 'directory', 'link']),
  downloads: z
    .object({
      raw: DownloadInfoSchema,
      lzma: DownloadInfoSchema.optional()
    })
    .optional(),
  executable: z.boolean().optional(),
  target: z.string().optional()
})

export const JavaRuntimeManifestSchema = z.object({
  files: z.record(z.string(), JavaRuntimeFileSchema)
})
export type JavaRuntimeManifest = z.infer<typeof JavaRuntimeManifestSchema>

// ---------------------------------------------------------------------------
// Mojang profile lookups (skins by username)
// ---------------------------------------------------------------------------

export const MojangProfileLookupSchema = z.object({
  id: z.string(),
  name: z.string()
})

export const SessionProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  properties: z.array(
    z.object({
      name: z.string(),
      value: z.string(),
      signature: z.string().optional()
    })
  )
})

export const TexturesPayloadSchema = z.object({
  timestamp: z.number().optional(),
  profileId: z.string().optional(),
  profileName: z.string().optional(),
  textures: z.object({
    SKIN: z
      .object({
        url: z.string(),
        metadata: z.object({ model: z.string().optional() }).optional()
      })
      .optional(),
    CAPE: z.object({ url: z.string() }).optional()
  })
})
export type TexturesPayload = z.infer<typeof TexturesPayloadSchema>

// ---------------------------------------------------------------------------
// launchercontent.mojang.com/v2/news.json
// ---------------------------------------------------------------------------

export const MojangNewsSchema = z.object({
  version: z.number().optional(),
  entries: z.array(
    z.object({
      // Mojang emits explicit nulls for missing fields, so everything optional is also nullable.
      id: z.string().nullable().optional(),
      title: z.string(),
      tag: z.string().nullable().optional(),
      category: z.string().nullable().optional(),
      date: z.string(),
      text: z.string().nullable().optional(),
      playPageImage: z.object({ title: z.string().nullable().optional(), url: z.string() }).nullable().optional(),
      newsPageImage: z.object({ title: z.string().nullable().optional(), url: z.string() }).nullable().optional(),
      readMoreLink: z.string().nullable().optional(),
      newsType: z.array(z.string()).nullable().optional()
    })
  )
})
export type MojangNews = z.infer<typeof MojangNewsSchema>
