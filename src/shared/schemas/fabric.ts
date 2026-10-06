import { z } from 'zod'

export const FabricLoaderEntrySchema = z.object({
  loader: z.object({
    separator: z.string().optional(),
    build: z.number().optional(),
    maven: z.string(),
    version: z.string(),
    stable: z.boolean()
  }),
  intermediary: z.object({
    maven: z.string(),
    version: z.string(),
    stable: z.boolean()
  }),
  launcherMeta: z.unknown().optional()
})
export type FabricLoaderEntry = z.infer<typeof FabricLoaderEntrySchema>

export const FabricLoaderListSchema = z.array(FabricLoaderEntrySchema)

export const FabricGameVersionSchema = z.object({
  version: z.string(),
  stable: z.boolean()
})
export const FabricGameVersionListSchema = z.array(FabricGameVersionSchema)
