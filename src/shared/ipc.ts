import { z } from 'zod'
import type {
  AccountSummary,
  AdminPlayer,
  FriendsView,
  OnlineState,
  ShardMe,
  ShopItem,
  CopyModsResult,
  CosmeticsView,
  CrashReport,
  ConsoleLine,
  DeviceCodeInfo,
  EquippedCosmetics,
  InstalledMod,
  InstallPlan,
  InstallResult,
  Instance,
  InstanceModsView,
  InstanceSummary,
  JavaRuntime,
  JavaValidation,
  LauncherUpdateState,
  LaunchProgress,
  LoginProgress,
  MigrationProgress,
  MinecraftProfile,
  ModrinthProject,
  ModrinthSearchResult,
  ModrinthVersion,
  ModsProgress,
  MrpackImportResult,
  NewsItem,
  ReleaseNote,
  SavedSkin,
  Settings,
  ShardBuild,
  ShardManifestView,
  SystemInfo,
  ToastPayload,
  VersionList,
  BundledModsManifest,
  DownloadProgress
} from './types'
import {
  HexColorSchema,
  InstanceSettingsPatchSchema,
  SettingsPatchSchema
} from './schemas/storage'

// ---------------------------------------------------------------------------
// Request/response channels. Inputs are defined by Zod (validated in preload
// and main); outputs are TypeScript types.
// ---------------------------------------------------------------------------

const id = z.object({ id: z.string().min(1) })
const instanceId = z.object({ instanceId: z.string().min(1) })
const none = z.void()
/** http(s) only: `new URL()` happily accepts javascript: and file: schemes. */
const httpUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'Only http(s) URLs are allowed')
/** Same rules as the Shard API: Minecraft names and cosmetic ids. */
const minecraftName = z.string().regex(/^[A-Za-z0-9_]{1,16}$/, 'Type a Minecraft name')
const playerUuid = z.object({ uuid: z.string().regex(/^[0-9a-fA-F-]{32,36}$/) })
const cosmeticId = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/)
/** An admin target: a Minecraft name or a uuid. */
const adminPlayer = z.string().min(1).max(36)

export const ipcInputSchemas = {
  // app
  'app:info': none,
  'app:openExternal': z.object({ url: httpUrl }),
  'app:openPath': z.object({ path: z.string().min(1) }),
  'app:showItemInFolder': z.object({ path: z.string().min(1) }),
  'app:pickFile': z.object({
    title: z.string().optional(),
    filters: z.array(z.object({ name: z.string(), extensions: z.array(z.string()) })).optional(),
    multiple: z.boolean().optional()
  }),
  'app:pickDirectory': z.object({ title: z.string().optional() }),
  'app:relaunch': none,
  'app:quit': none,
  'app:clearCache': none,
  'app:openLogs': none,
  'app:resetLauncher': none,
  'app:copyToClipboard': z.object({ text: z.string() }),

  // window
  'window:minimize': none,
  'window:toggleMaximize': none,
  'window:close': none,
  'window:isMaximized': none,

  // settings
  'settings:get': none,
  'settings:update': SettingsPatchSchema,
  'settings:migrateDataDir': z.object({ target: z.string().min(1) }),
  'settings:previewAccent': z.object({ accent: HexColorSchema }),

  // auth
  'auth:listAccounts': none,
  'auth:getActive': none,
  'auth:setActive': id,
  'auth:login': z.object({ method: z.enum(['browser', 'device']) }),
  'auth:cancelLogin': none,
  'auth:logout': id,
  'auth:refresh': id,
  'auth:getProfile': z.object({ id: z.string().optional(), refresh: z.boolean().optional() }),

  // versions
  'versions:list': z.object({
    includeSnapshots: z.boolean().optional(),
    refresh: z.boolean().optional()
  }),
  'versions:install': z.object({
    minecraftVersion: z.string().min(1),
    type: z.enum(['shard', 'vanilla']),
    name: z.string().min(1).max(64).optional()
  }),

  // instances
  'instances:list': none,
  'instances:get': id,
  'instances:create': z.object({
    name: z.string().min(1).max(64),
    minecraftVersion: z.string().min(1),
    type: z.enum(['shard', 'vanilla'])
  }),
  'instances:update': z.object({
    id: z.string().min(1),
    patch: z.object({
      name: z.string().min(1).max(64).optional(),
      icon: z.string().nullable().optional(),
      settings: InstanceSettingsPatchSchema.optional()
    })
  }),
  'instances:duplicate': z.object({ id: z.string().min(1), name: z.string().min(1).max(64) }),
  'instances:delete': id,
  'instances:openFolder': z.object({ id: z.string().min(1), sub: z.string().optional() }),
  'instances:diskUsage': id,
  'instances:prepare': z.object({ id: z.string().min(1), repair: z.boolean().optional() }),
  'instances:cancelPrepare': id,

  // launch
  'launch:start': instanceId,
  'launch:kill': instanceId,
  'launch:getState': instanceId,
  'launch:getAll': none,
  'launch:getConsole': z.object({ instanceId: z.string().min(1), after: z.number().optional() }),
  'launch:clearConsole': instanceId,
  'launch:exportConsole': instanceId,
  'launch:getCrashReport': instanceId,

  // java
  'java:list': none,
  'java:validate': z.object({ path: z.string().min(1) }),
  'java:ensure': z.object({ major: z.number().int().min(8).max(99) }),
  'java:addCustom': z.object({ path: z.string().min(1) }),
  'java:remove': id,

  // mods
  'mods:view': instanceId,
  'mods:bundledManifest': none,
  'mods:syncBundled': instanceId,
  'mods:setEnabled': z.object({
    instanceId: z.string().min(1),
    fileName: z.string().min(1),
    enabled: z.boolean()
  }),
  'mods:setBundledEnabled': z.object({
    instanceId: z.string().min(1),
    slug: z.string().min(1),
    enabled: z.boolean()
  }),
  'mods:remove': z.object({ instanceId: z.string().min(1), fileName: z.string().min(1) }),
  'mods:importFiles': z.object({ instanceId: z.string().min(1), paths: z.array(z.string()).min(1) }),
  'mods:importMrpack': z.object({ instanceId: z.string().min(1), path: z.string().min(1) }),
  'mods:checkUpdates': instanceId,
  'mods:updateAll': instanceId,
  'mods:update': z.object({ instanceId: z.string().min(1), fileName: z.string().min(1) }),
  'mods:copyTo': z.object({ fromInstanceId: z.string().min(1), toInstanceId: z.string().min(1) }),
  'mods:openFile': z.object({ instanceId: z.string().min(1), fileName: z.string().min(1) }),

  // modrinth
  'modrinth:search': z.object({
    query: z.string().default(''),
    gameVersion: z.string().min(1),
    index: z.enum(['relevance', 'downloads', 'follows', 'newest', 'updated']).default('relevance'),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(100).default(20),
    categories: z.array(z.string()).optional()
  }),
  'modrinth:project': z.object({ idOrSlug: z.string().min(1) }),
  'modrinth:versions': z.object({ idOrSlug: z.string().min(1), gameVersion: z.string().min(1) }),
  'modrinth:plan': z.object({
    instanceId: z.string().min(1),
    projectId: z.string().min(1),
    versionId: z.string().optional()
  }),
  'modrinth:install': z.object({
    instanceId: z.string().min(1),
    projectId: z.string().min(1),
    versionId: z.string().optional(),
    includeOptional: z.array(z.string()).default([])
  }),

  // skins
  'skins:library': none,
  'skins:addFromFile': z.object({ path: z.string().min(1), name: z.string().optional() }),
  'skins:addFromUsername': z.object({ username: z.string().min(1).max(16) }),
  'skins:addFromUrl': z.object({ url: httpUrl, name: z.string().optional() }),
  'skins:saveCurrent': none,
  'skins:update': z.object({
    id: z.string().min(1),
    patch: z.object({
      name: z.string().min(1).max(48).optional(),
      favorite: z.boolean().optional(),
      variant: z.enum(['classic', 'slim']).optional()
    })
  }),
  'skins:delete': id,
  'skins:apply': z.object({ id: z.string().min(1), variant: z.enum(['classic', 'slim']).optional() }),
  'skins:applyUrl': z.object({ url: httpUrl, variant: z.enum(['classic', 'slim']) }),
  'skins:reset': none,
  'skins:setCape': z.object({ capeId: z.string().nullable() }),
  'skins:fetchTexture': z.object({ url: httpUrl }),

  // cosmetics
  'cosmetics:list': z.object({ refresh: z.boolean().optional() }),
  'cosmetics:equip': z.object({
    type: z.enum(['cape', 'cloak', 'hat', 'wings', 'bandana', 'backbling']),
    id: z.string().nullable()
  }),
  'cosmetics:toggleEmote': z.object({ id: z.string().min(1) }),

  // Shard API: tokens, shop, friends, admin (main process talks to the API; see shard-api/)
  'online:state': z.object({ refresh: z.boolean().optional() }),
  'online:buy': z.object({ id: cosmeticId }),
  'friends:list': none,
  'friends:request': z.object({ name: minecraftName }),
  'friends:accept': playerUuid,
  'friends:decline': playerUuid,
  'friends:remove': playerUuid,
  'admin:players': z.object({ q: z.string().max(16).default('') }),
  'admin:tokens': z.object({
    player: adminPlayer,
    amount: z.number().int().min(-1_000_000).max(1_000_000)
  }),
  'admin:grant': z.object({ player: adminPlayer, id: cosmeticId }),
  'admin:revoke': z.object({ player: adminPlayer, id: cosmeticId }),
  'admin:price': z.object({ id: cosmeticId, price: z.number().int().min(0).max(1_000_000).nullable() }),

  // shard client
  'shard:manifest': z.object({ refresh: z.boolean().optional() }),
  'shard:buildFor': z.object({ minecraftVersion: z.string().min(1) }),
  'shard:reinstall': instanceId,

  // updates & news
  'updates:getState': none,
  'updates:check': none,
  'updates:download': none,
  'updates:install': none,
  'updates:releaseNotes': none,
  'updates:markSeen': none,
  'news:minecraft': none
} as const

export type IpcChannel = keyof typeof ipcInputSchemas
export type IpcInput<K extends IpcChannel> = z.infer<(typeof ipcInputSchemas)[K]>

export interface IpcOutputs {
  'app:info': SystemInfo
  'app:openExternal': void
  'app:openPath': void
  'app:showItemInFolder': void
  'app:pickFile': string[] | null
  'app:pickDirectory': string | null
  'app:relaunch': void
  'app:quit': void
  'app:clearCache': { freedBytes: number }
  'app:openLogs': void
  'app:resetLauncher': void
  'app:copyToClipboard': void

  'window:minimize': void
  'window:toggleMaximize': void
  'window:close': void
  'window:isMaximized': boolean

  'settings:get': Settings
  'settings:update': Settings
  'settings:migrateDataDir': Settings
  'settings:previewAccent': void

  'auth:listAccounts': AccountSummary[]
  'auth:getActive': AccountSummary | null
  'auth:setActive': AccountSummary
  'auth:login': AccountSummary
  'auth:cancelLogin': void
  'auth:logout': void
  'auth:refresh': AccountSummary
  'auth:getProfile': MinecraftProfile

  'versions:list': VersionList
  'versions:install': Instance

  'instances:list': InstanceSummary[]
  'instances:get': InstanceSummary
  'instances:create': Instance
  'instances:update': Instance
  'instances:duplicate': Instance
  'instances:delete': void
  'instances:openFolder': void
  'instances:diskUsage': number
  'instances:prepare': void
  'instances:cancelPrepare': void

  'launch:start': void
  'launch:kill': void
  'launch:getState': LaunchProgress
  'launch:getAll': LaunchProgress[]
  'launch:getConsole': ConsoleLine[]
  'launch:clearConsole': void
  'launch:exportConsole': string | null
  'launch:getCrashReport': CrashReport | null

  'java:list': JavaRuntime[]
  'java:validate': JavaValidation
  'java:ensure': JavaRuntime
  'java:addCustom': JavaRuntime
  'java:remove': void

  'mods:view': InstanceModsView
  'mods:bundledManifest': BundledModsManifest
  'mods:syncBundled': InstanceModsView
  'mods:setEnabled': void
  'mods:setBundledEnabled': void
  'mods:remove': void
  'mods:importFiles': InstalledMod[]
  'mods:importMrpack': MrpackImportResult
  'mods:checkUpdates': InstalledMod[]
  'mods:updateAll': { updated: string[] }
  'mods:update': InstalledMod
  'mods:copyTo': CopyModsResult
  'mods:openFile': void

  'modrinth:search': ModrinthSearchResult
  'modrinth:project': ModrinthProject
  'modrinth:versions': ModrinthVersion[]
  'modrinth:plan': InstallPlan
  'modrinth:install': InstallResult

  'skins:library': SavedSkin[]
  'skins:addFromFile': SavedSkin
  'skins:addFromUsername': SavedSkin
  'skins:addFromUrl': SavedSkin
  'skins:saveCurrent': SavedSkin
  'skins:update': SavedSkin
  'skins:delete': void
  'skins:apply': MinecraftProfile
  'skins:applyUrl': MinecraftProfile
  'skins:reset': MinecraftProfile
  'skins:setCape': MinecraftProfile
  'skins:fetchTexture': string

  'cosmetics:list': CosmeticsView
  'cosmetics:equip': EquippedCosmetics
  'cosmetics:toggleEmote': EquippedCosmetics

  'online:state': OnlineState
  'online:buy': ShardMe
  'friends:list': FriendsView
  'friends:request': FriendsView
  'friends:accept': FriendsView
  'friends:decline': FriendsView
  'friends:remove': FriendsView
  'admin:players': AdminPlayer[]
  'admin:tokens': AdminPlayer
  'admin:grant': AdminPlayer
  'admin:revoke': AdminPlayer
  'admin:price': ShopItem[]

  'shard:manifest': ShardManifestView
  'shard:buildFor': ShardBuild | null
  'shard:reinstall': void

  'updates:getState': LauncherUpdateState
  'updates:check': LauncherUpdateState
  'updates:download': void
  'updates:install': void
  'updates:releaseNotes': ReleaseNote[]
  'updates:markSeen': void
  'news:minecraft': NewsItem[]
}

export type IpcOutput<K extends IpcChannel> = IpcOutputs[K]

// Compile-time check: every channel with a schema has an output type and vice versa.
// On a mismatch the offending channel name shows up in the type error.
type MissingOutputs = Exclude<IpcChannel, keyof IpcOutputs>
type ExtraOutputs = Exclude<keyof IpcOutputs, IpcChannel>
const _assertNoMissingOutputs: [MissingOutputs] extends [never] ? true : MissingOutputs = true
const _assertNoExtraOutputs: [ExtraOutputs] extends [never] ? true : ExtraOutputs = true
void _assertNoMissingOutputs
void _assertNoExtraOutputs

export const IPC_CHANNELS = Object.keys(ipcInputSchemas) as IpcChannel[]

// ---------------------------------------------------------------------------
// Push events (main -> renderer)
// ---------------------------------------------------------------------------

export interface IpcEvents {
  'window:maximized': boolean
  'window:focus': boolean
  'settings:changed': Settings
  'settings:migrationProgress': MigrationProgress
  'auth:accountsChanged': AccountSummary[]
  'auth:deviceCode': DeviceCodeInfo
  'auth:loginProgress': LoginProgress
  /** The running game asked to add an account (account bridge): open the sign-in dialog. */
  'auth:signInRequested': Record<string, never>
  'instances:changed': InstanceSummary[]
  'launch:progress': LaunchProgress
  'launch:console': { instanceId: string; lines: ConsoleLine[] }
  'java:progress': { major: number; download: DownloadProgress; message: string }
  'mods:progress': ModsProgress
  'mods:changed': { instanceId: string }
  'cosmetics:changed': EquippedCosmetics
  'updates:state': LauncherUpdateState
  'app:toast': ToastPayload
  'app:navigate': { page: string }
}

export type IpcEventName = keyof IpcEvents

export const IPC_EVENTS: readonly IpcEventName[] = [
  'window:maximized',
  'window:focus',
  'settings:changed',
  'settings:migrationProgress',
  'auth:accountsChanged',
  'auth:deviceCode',
  'auth:loginProgress',
  'auth:signInRequested',
  'instances:changed',
  'launch:progress',
  'launch:console',
  'java:progress',
  'mods:progress',
  'mods:changed',
  'cosmetics:changed',
  'updates:state',
  'app:toast',
  'app:navigate'
]

// ---------------------------------------------------------------------------
// Wire format
// ---------------------------------------------------------------------------

export type IpcResponse<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: { code: string; message: string; details?: unknown; recoverable: boolean }
    }

/** Shape of `window.shard`, the only bridge the renderer has into the main process. */
export interface ShardApi {
  invoke<K extends IpcChannel>(
    channel: K,
    ...args: IpcInput<K> extends void ? [] : [input: IpcInput<K>]
  ): Promise<IpcOutput<K>>
  on<E extends IpcEventName>(event: E, listener: (payload: IpcEvents[E]) => void): () => void
  platform: 'win32' | 'darwin' | 'linux'
  versions: { electron: string; chrome: string; node: string }
}
