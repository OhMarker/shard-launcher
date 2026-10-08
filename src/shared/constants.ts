/** Product identity and remote endpoints shared by main, preload and renderer. */

export const PRODUCT_NAME = 'Shard'
export const APP_NAME = 'Shard Launcher'
export const APP_ID = 'shard-launcher'
export const TAGLINE = 'Sharpen your crystal PvP.'

/** Oldest Minecraft release Shard supports. Everything older does not exist in the launcher. */
export const MIN_MINECRAFT_VERSION = '1.21'

export const DEFAULT_ACCENT = '#22D3EE'

export const GITHUB_OWNER = 'OhMarker'
export const GITHUB_REPO = 'shard-launcher'
export const GITHUB_META_REPO = 'meta'

export const WINDOW_DEFAULT = { width: 1280, height: 760 } as const
export const WINDOW_MIN = { width: 1100, height: 650 } as const

/** Microsoft identity platform settings (consumers tenant). */
export const MSA = {
  authority: 'https://login.microsoftonline.com/consumers/oauth2/v2.0',
  scopes: 'XboxLive.signin offline_access',
  /**
   * Loopback redirect. Register exactly this value under
   * "Mobile and desktop applications" in the Azure app registration.
   */
  redirectUri: 'http://localhost/shard-auth'
} as const

export const URLS = {
  versionManifest: 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
  javaRuntimeAll:
    'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json',
  assetsBase: 'https://resources.download.minecraft.net',
  librariesBase: 'https://libraries.minecraft.net',
  fabricMeta: 'https://meta.fabricmc.net/v2',
  fabricMaven: 'https://maven.fabricmc.net/',
  modrinth: 'https://api.modrinth.com/v2',
  minecraftServices: 'https://api.minecraftservices.com',
  mojangApi: 'https://api.mojang.com',
  sessionServer: 'https://sessionserver.mojang.com',
  xblAuth: 'https://user.auth.xboxlive.com/user/authenticate',
  xstsAuth: 'https://xsts.auth.xboxlive.com/xsts/authorize',
  mojangNews: 'https://launchercontent.mojang.com/v2/news.json',
  mojangNewsImageBase: 'https://launchercontent.mojang.com',
  adoptium: 'https://api.adoptium.net/v3',
  githubApi: 'https://api.github.com',
  shardManifest: `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_META_REPO}/main/shard-manifest.json`,
  bundledMods: `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_META_REPO}/main/bundled-mods.json`,
  cosmetics: `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_META_REPO}/main/cosmetics.json`,
  /** `{ "api": "https://..." }`: where the Shard API lives, so it can move without a launcher release. */
  services: `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_META_REPO}/main/services.json`,
  mojangJoin: 'https://sessionserver.mojang.com/session/minecraft/join',
  minecraftProfileHelp: 'https://www.minecraft.net/msaprofile/mygames/editprofile',
  buyMinecraft: 'https://www.minecraft.net/store/minecraft-java-bedrock-edition-pc',
  xboxFamily: 'https://account.microsoft.com/family'
} as const

/** Modrinth asks for 300 requests per minute per client. */
export const MODRINTH_RATE_LIMIT_PER_MINUTE = 300

export const DEFAULT_DOWNLOAD_CONCURRENCY = 12
export const MIN_DOWNLOAD_CONCURRENCY = 2
export const MAX_DOWNLOAD_CONCURRENCY = 32

export const CONSOLE_BUFFER_LINES = 5000

export const SKIN_SIZES = {
  modern: { width: 64, height: 64 },
  legacy: { width: 64, height: 32 }
} as const

export const CAPE_TEXTURE = { width: 64, height: 32 } as const

export const SHARED_CONFIG_DIR = 'shared-config'
export const COSMETICS_DIR = 'cosmetics'
export const EQUIPPED_FILE = 'equipped.json'
export const LAUNCHER_INFO_FILE = 'launcher-info.json'
export const INSTANCE_FILE = 'instance.json'
