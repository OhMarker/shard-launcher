import { z } from 'zod'
import {
  DEFAULT_ACCENT,
  DEFAULT_DOWNLOAD_CONCURRENCY,
  MAX_DOWNLOAD_CONCURRENCY,
  MIN_DOWNLOAD_CONCURRENCY,
  WINDOW_DEFAULT
} from '../constants'
import { type Settings } from '../types/settings'
import { type Instance, type InstanceSettings, type JavaRuntime } from '../types/instances'
import { type SavedSkin } from '../types/skins'

export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const SettingsSchema = z.object({
  accent: HexColorSchema.default(DEFAULT_ACCENT),
  theme: z.enum(['dark', 'light']).default('dark'),
  defaultInstanceId: z.string().nullable().default(null),
  launchBehavior: z.enum(['keep', 'minimize', 'close']).default('keep'),
  closeToTray: z.boolean().default(false),
  autoUpdateMods: z.boolean().default(true),
  sharedConfig: z.boolean().default(true),
  downloadConcurrency: z
    .number()
    .int()
    .min(MIN_DOWNLOAD_CONCURRENCY)
    .max(MAX_DOWNLOAD_CONCURRENCY)
    .default(DEFAULT_DOWNLOAD_CONCURRENCY),
  dataDir: z.string().nullable().default(null),
  java: z
    .object({
      memoryMb: z.number().int().min(1024).default(4096),
      jvmArgs: z.array(z.string()).default([])
    })
    .default({ memoryMb: 4096, jvmArgs: [] }),
  discordRpc: z.boolean().default(true),
  analytics: z.boolean().default(false),
  showSnapshots: z.boolean().default(false),
  updateChannel: z.enum(['stable', 'beta']).default('stable'),
  lastSeenVersion: z.string().nullable().default(null),
  msaClientId: z.string().nullable().default(null),
  manifestUrls: z
    .object({
      shard: z.string().nullable().default(null),
      bundledMods: z.string().nullable().default(null),
      cosmetics: z.string().nullable().default(null),
      services: z.string().nullable().default(null)
    })
    .default({ shard: null, bundledMods: null, cosmetics: null, services: null }),
  viewer: z
    .object({
      animation: z.enum(['idle', 'walk', 'run']).default('idle'),
      back: z.enum(['cape', 'elytra']).default('cape'),
      autoRotate: z.boolean().default(true)
    })
    .default({ animation: 'idle', back: 'cape', autoRotate: true }),
  window: z
    .object({
      width: z.number().int().default(WINDOW_DEFAULT.width),
      height: z.number().int().default(WINDOW_DEFAULT.height),
      x: z.number().int().nullable().default(null),
      y: z.number().int().nullable().default(null),
      maximized: z.boolean().default(false)
    })
    .default({
      width: WINDOW_DEFAULT.width,
      height: WINDOW_DEFAULT.height,
      x: null,
      y: null,
      maximized: false
    }),
  onboarded: z.boolean().default(false)
})

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({})

/** Partial update accepted from the renderer. Nested objects are replaced wholesale. */
export const SettingsPatchSchema = SettingsSchema.partial()

export const InstanceSettingsSchema = z.object({
  memoryMb: z.number().int().min(512).default(4096),
  javaPath: z.string().nullable().default(null),
  jvmArgs: z.array(z.string()).default([]),
  gameArgs: z.array(z.string()).default([]),
  width: z.number().int().min(320).default(1280),
  height: z.number().int().min(240).default(720),
  fullscreen: z.boolean().default(false),
  preLaunchHook: z.string().default(''),
  postExitHook: z.string().default(''),
  sharedConfig: z.boolean().default(true),
  disabledBundled: z.array(z.string()).default([])
})

export const DEFAULT_INSTANCE_SETTINGS: InstanceSettings = InstanceSettingsSchema.parse({})

export const InstanceSettingsPatchSchema = InstanceSettingsSchema.partial()

export const InstanceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['shard', 'vanilla']),
  minecraftVersion: z.string().min(1),
  fabricLoader: z.string().nullable().default(null),
  shardBuild: z.string().nullable().default(null),
  createdAt: z.string(),
  lastPlayedAt: z.string().nullable().default(null),
  playtimeMs: z.number().default(0),
  icon: z.string().nullable().default(null),
  installState: z.enum(['pending', 'installed', 'broken']).default('pending'),
  settings: InstanceSettingsSchema.default(DEFAULT_INSTANCE_SETTINGS)
})
export const assertInstance = (value: unknown): Instance => InstanceSchema.parse(value)

export const SavedSkinSchema = z.object({
  id: z.string(),
  name: z.string(),
  variant: z.enum(['classic', 'slim']),
  favorite: z.boolean().default(false),
  createdAt: z.string(),
  source: z.enum(['file', 'username', 'url', 'current']),
  sourceLabel: z.string().nullable().default(null),
  dataUrl: z.string().startsWith('data:image/png;base64,')
})
export const SavedSkinListSchema = z.array(SavedSkinSchema)
export const assertSavedSkin = (value: unknown): SavedSkin => SavedSkinSchema.parse(value)

export const JavaRuntimeRecordSchema = z.object({
  id: z.string(),
  major: z.number().int(),
  path: z.string(),
  version: z.string().nullable().default(null),
  source: z.enum(['mojang', 'adoptium', 'custom', 'system']),
  valid: z.boolean().default(true),
  component: z.string().nullable().default(null)
})
export const JavaRuntimeListSchema = z.array(JavaRuntimeRecordSchema)
export const assertJavaRuntime = (value: unknown): JavaRuntime => JavaRuntimeRecordSchema.parse(value)

/** Generic on-disk cache envelope for remote JSON. */
export const CacheEnvelopeSchema = z.object({
  fetchedAt: z.string(),
  etag: z.string().nullable().default(null),
  url: z.string(),
  data: z.unknown()
})
export type CacheEnvelope = z.infer<typeof CacheEnvelopeSchema>
