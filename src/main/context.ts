/**
 * Service contracts for the main process. Every feature module implements one of these
 * interfaces and registers its IPC handlers through `registerXxxIpc(ctx)`. Keeping the
 * contracts in one file lets modules depend on each other through `ctx.services` without
 * import cycles.
 */
import { type BrowserWindow } from 'electron'
import type {
  AccountBridgeInfo,
  AccountSummary,
  AdminPlayer,
  FriendsView,
  OnlineState,
  ShardMe,
  ShopItem,
  BundledModsManifest,
  CopyModsResult,
  CosmeticSlot,
  CosmeticsView,
  CrashReport,
  ConsoleLine,
  DownloadProgress,
  EquippedCosmetics,
  InstalledMod,
  InstallPlan,
  InstallResult,
  Instance,
  InstanceModsView,
  InstanceSettings,
  InstanceSummary,
  InstanceType,
  JavaRuntime,
  JavaValidation,
  LauncherUpdateState,
  LaunchProgress,
  LoginMethod,
  MinecraftProfile,
  ModrinthProject,
  ModrinthSearchResult,
  ModrinthSortIndex,
  ModrinthVersion,
  MrpackImportResult,
  NewsItem,
  ReleaseNote,
  SavedSkin,
  ShardBuild,
  ShardManifestView,
  SkinVariant,
  VersionList
} from '@shared/types'
import type { ManifestVersion, VersionJson } from '@shared/schemas/mojang'
import { type emit } from './ipc/router'
import { type Paths } from './paths'
import { type SettingsStore } from './store/settings'

export interface ProgressSink {
  signal?: AbortSignal
  onProgress?: (download: DownloadProgress, message: string) => void
  onMessage?: (message: string) => void
}

/** A valid Minecraft session, ready to be substituted into launch arguments. */
export interface GameSession {
  accountId: string
  username: string
  /** UUID without dashes. */
  uuid: string
  accessToken: string
  xuid: string
  userType: 'msa'
  expiresAt: string
}

export interface AccountService {
  list(): AccountSummary[]
  getActive(): AccountSummary | null
  setActive(id: string): AccountSummary
  login(method: LoginMethod): Promise<AccountSummary>
  cancelLogin(): void
  logout(id: string): Promise<void>
  refresh(id: string): Promise<AccountSummary>
  /** Valid session for the given (or active) account, refreshing silently when needed. */
  getSession(id?: string): Promise<GameSession>
  /** Last known session even if expired. Used for offline launches of installed instances. */
  getLastKnownSession(id?: string): GameSession | null
  getProfile(id?: string, refresh?: boolean): Promise<MinecraftProfile>
  /** Authenticated request to api.minecraftservices.com. `path` starts with '/'. */
  servicesFetch(path: string, init?: RequestInit & { accountId?: string }): Promise<Response>
  refreshAllOnStartup(): Promise<void>
  isConfigured(): boolean
}

export interface VersionService {
  list(opts?: { includeSnapshots?: boolean; refresh?: boolean }): Promise<VersionList>
  getManifestVersion(id: string): Promise<ManifestVersion>
  /** Vanilla version JSON, cached under versions/<id>/<id>.json. */
  getVersionJson(id: string, opts?: { signal?: AbortSignal }): Promise<VersionJson>
  getLatestRelease(): Promise<string | null>
}

export interface InstanceService {
  list(): Promise<InstanceSummary[]>
  get(id: string): Promise<InstanceSummary>
  /** Synchronous lookup from the in-memory registry; throws NOT_FOUND. */
  getRaw(id: string): Instance
  all(): Instance[]
  create(input: { name: string; minecraftVersion: string; type: InstanceType }): Promise<Instance>
  update(
    id: string,
    patch: { name?: string; icon?: string | null; settings?: Partial<InstanceSettings> }
  ): Promise<Instance>
  duplicate(id: string, name: string): Promise<Instance>
  delete(id: string): Promise<void>
  folder(id: string): string
  diskUsage(id: string): Promise<number>
  /** Persists a mutated instance record and notifies listeners. */
  save(instance: Instance): Promise<Instance>
  uniqueName(base: string): string
  onChanged(listener: () => void): () => void
}

export interface JavaService {
  list(): JavaRuntime[]
  validate(path: string): Promise<JavaValidation>
  /** Ensures a managed runtime for the given major exists, downloading if needed. */
  ensure(major: number, sink?: ProgressSink): Promise<JavaRuntime>
  addCustom(path: string): Promise<JavaRuntime>
  remove(id: string): Promise<void>
  /** Custom path when configured and valid, otherwise the managed runtime. */
  resolveForInstance(instance: Instance, requiredMajor: number, sink?: ProgressSink): Promise<JavaRuntime>
}

export interface LaunchService {
  start(instanceId: string): Promise<void>
  /** Download and verify everything without launching (used by Install and Repair). */
  prepare(instanceId: string, opts?: { repair?: boolean }): Promise<void>
  cancelPrepare(instanceId: string): void
  kill(instanceId: string): Promise<void>
  getState(instanceId: string): LaunchProgress
  getAll(): LaunchProgress[]
  getConsole(instanceId: string, after?: number): ConsoleLine[]
  clearConsole(instanceId: string): void
  exportConsole(instanceId: string): Promise<string | null>
  getCrashReport(instanceId: string): Promise<CrashReport | null>
  isRunning(instanceId: string): boolean
  anyRunning(): boolean
  killAll(): Promise<void>
}

export interface ModService {
  getBundledManifest(opts?: { refresh?: boolean }): Promise<BundledModsManifest>
  view(instanceId: string): Promise<InstanceModsView>
  /**
   * Installs missing bundled mods for the instance's Minecraft version, applies updates when
   * requested, removes stale duplicates. Mods with no compatible build yet are reported as
   * waiting and skipped. Called by the launch pipeline before every launch.
   */
  syncBundled(instanceId: string, opts?: { checkUpdates?: boolean } & ProgressSink): Promise<InstanceModsView>
  setEnabled(instanceId: string, fileName: string, enabled: boolean): Promise<void>
  setBundledEnabled(instanceId: string, slug: string, enabled: boolean): Promise<void>
  remove(instanceId: string, fileName: string): Promise<void>
  importFiles(instanceId: string, paths: string[]): Promise<InstalledMod[]>
  importMrpack(instanceId: string, path: string): Promise<MrpackImportResult>
  checkUpdates(instanceId: string): Promise<InstalledMod[]>
  updateAll(instanceId: string): Promise<{ updated: string[] }>
  update(instanceId: string, fileName: string): Promise<InstalledMod>
  copyTo(fromInstanceId: string, toInstanceId: string): Promise<CopyModsResult>
  plan(instanceId: string, projectId: string, versionId?: string): Promise<InstallPlan>
  install(
    instanceId: string,
    projectId: string,
    versionId: string | undefined,
    includeOptional: string[]
  ): Promise<InstallResult>
  listInstalled(instanceId: string): Promise<InstalledMod[]>
}

export interface ModrinthSearchParams {
  query: string
  gameVersion: string
  index: ModrinthSortIndex
  offset: number
  limit: number
  categories?: string[]
}

export interface ModrinthClient {
  search(params: ModrinthSearchParams): Promise<ModrinthSearchResult>
  getProject(idOrSlug: string): Promise<ModrinthProject>
  getProjects(ids: string[]): Promise<ModrinthProject[]>
  getVersions(idOrSlug: string, opts?: { gameVersion?: string; loaders?: string[] }): Promise<ModrinthVersion[]>
  getVersion(versionId: string): Promise<ModrinthVersion>
  /** sha512 -> version for files Modrinth knows about. */
  getVersionsByHashes(sha512s: string[]): Promise<Record<string, ModrinthVersion>>
  /** sha512 -> newest compatible version (POST /version_files/update). */
  getUpdates(sha512s: string[], opts: { gameVersion: string; loaders: string[] }): Promise<Record<string, ModrinthVersion>>
  /** Newest release-channel version supporting the game version (falls back to beta/alpha). */
  pickLatestCompatible(versions: ModrinthVersion[], gameVersion: string): ModrinthVersion | null
}

export interface ShardClientService {
  getManifest(opts?: { refresh?: boolean }): Promise<ShardManifestView>
  buildFor(minecraftVersion: string): Promise<ShardBuild | null>
  /**
   * Ensures the right Shard jar is in the instance's mods folder (downloads/verifies by sha512,
   * removes stale builds). Returns null when no build exists for the version (client pending).
   */
  sync(instance: Instance, opts?: { force?: boolean } & ProgressSink): Promise<ShardBuild | null>
  reinstall(instanceId: string): Promise<void>
  /** `accountBridge` is written only when given (Shard launches with a running bridge). */
  writeLauncherInfo(instance: Instance, session: GameSession | null, accountBridge?: AccountBridgeInfo | null): Promise<void>
}

export interface SharedConfigService {
  dir(): string
  /** Copies shared files into the instance before launch (shared wins when newer). */
  syncIn(instance: Instance): Promise<void>
  /** Copies changed files back to the shared layer after the game exits. */
  syncOut(instance: Instance): Promise<void>
}

export interface CosmeticsService {
  list(opts?: { refresh?: boolean }): Promise<CosmeticsView>
  equip(slot: CosmeticSlot, id: string | null): Promise<EquippedCosmetics>
  toggleEmote(id: string): Promise<EquippedCosmetics>
  equippedPath(): string
  /** Writes equipped.json for the given account and makes sure equipped textures are cached locally. */
  prepareForLaunch(accountId: string | null): Promise<void>
}

/**
 * The Shard API (tokens, shop, friends, admin). Signs in per Microsoft account with Mojang's
 * server-join check; the Minecraft access token is only ever sent to Mojang.
 */
export interface ShardApiService {
  /** Never throws for "no API" or "no account": those are states the UI shows. */
  state(opts?: { refresh?: boolean }): Promise<OnlineState>
  shop(): Promise<ShopItem[]>
  me(): Promise<ShardMe>
  buy(id: string): Promise<ShardMe>
  equip(capeId: string | null): Promise<ShardMe>
  /**
   * Mirrors a local cape change to the API when signed in. Returns the API's ownership for the
   * equip check (nothing from the shop when signed out), or null when the API is unavailable
   * (local catalogue rules apply).
   */
  syncCape(capeId: string | null): Promise<{ owned: string[]; shop: ShopItem[] } | null>
  friends(): Promise<FriendsView>
  requestFriend(name: string): Promise<FriendsView>
  acceptFriend(uuid: string): Promise<FriendsView>
  declineFriend(uuid: string): Promise<FriendsView>
  removeFriend(uuid: string): Promise<FriendsView>
  adminPlayers(q: string): Promise<AdminPlayer[]>
  adminTokens(player: string, amount: number): Promise<AdminPlayer>
  adminGrant(player: string, id: string): Promise<AdminPlayer>
  adminRevoke(player: string, id: string): Promise<AdminPlayer>
  adminPrice(id: string, price: number | null): Promise<ShopItem[]>
  adminStaff(): Promise<AdminPlayer[]>
  adminRole(player: string, role: 'admin' | 'mod' | null): Promise<AdminPlayer>
}

export interface SkinService {
  library(): Promise<SavedSkin[]>
  addFromFile(path: string, name?: string): Promise<SavedSkin>
  addFromUsername(username: string): Promise<SavedSkin>
  addFromUrl(url: string, name?: string): Promise<SavedSkin>
  saveCurrent(): Promise<SavedSkin>
  update(id: string, patch: { name?: string; favorite?: boolean; variant?: SkinVariant }): Promise<SavedSkin>
  delete(id: string): Promise<void>
  apply(id: string, variant?: SkinVariant): Promise<MinecraftProfile>
  applyUrl(url: string, variant: SkinVariant): Promise<MinecraftProfile>
  reset(): Promise<MinecraftProfile>
  setCape(capeId: string | null): Promise<MinecraftProfile>
  /** Fetches a remote PNG (skin or cape) and returns a data URL, cached on disk. */
  fetchTexture(url: string): Promise<string>
}

export interface UpdateService {
  init(): void
  getState(): LauncherUpdateState
  check(): Promise<LauncherUpdateState>
  download(): Promise<void>
  install(): void
  releaseNotes(): Promise<ReleaseNote[]>
  markSeen(): void
}

export interface NewsService {
  minecraft(): Promise<NewsItem[]>
}

export interface DiscordActivity {
  details: string
  state: string
  startTimestamp?: number
  largeImageKey?: string
  largeImageText?: string
}

export interface DiscordService {
  setEnabled(enabled: boolean): void
  setActivity(activity: DiscordActivity): void
  clear(): void
  dispose(): void
}

export interface Services {
  accounts: AccountService
  versions: VersionService
  instances: InstanceService
  java: JavaService
  launcher: LaunchService
  mods: ModService
  modrinth: ModrinthClient
  shard: ShardClientService
  sharedConfig: SharedConfigService
  cosmetics: CosmeticsService
  shardApi: ShardApiService
  skins: SkinService
  updates: UpdateService
  news: NewsService
  discord: DiscordService
}

export interface AppContext {
  paths: Paths
  settings: SettingsStore
  version: string
  isDev: boolean
  isPackaged: boolean
  /** Absolute path to the bundled `resources/` folder (works packaged and in dev). */
  resourcesDir: string
  getWindow(): BrowserWindow | null
  emit: typeof emit
  /** Populated during bootstrap; modules must only access it lazily (inside methods). */
  services: Services
  /** Resolved MSA client id or null when sign-in is not configured. */
  msaClientId(): string | null
  msaRedirectUri(): string
  manifestUrls(): { shard: string; bundledMods: string; cosmetics: string; services: string }
  modrinthUserAgent(): string
}
