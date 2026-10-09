/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
  readonly MSA_CLIENT_ID?: string
  readonly MSA_REDIRECT_URI?: string
  readonly SHARD_MANIFEST_URL?: string
  readonly SHARD_BUNDLED_MODS_URL?: string
  readonly SHARD_COSMETICS_URL?: string
  readonly SHARD_COSMETICS_V2_URL?: string
  readonly SHARD_SERVICES_URL?: string
  readonly MODRINTH_CONTACT?: string
}
