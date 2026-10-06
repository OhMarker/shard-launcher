export type SkinVariant = 'classic' | 'slim'

/** What the renderer sees about a signed-in account. Never includes credentials. */
export interface AccountSummary {
  /** Minecraft profile UUID without dashes. */
  id: string
  username: string
  xuid: string | null
  skinUrl: string | null
  skinVariant: SkinVariant
  capeUrl: string | null
  addedAt: string
  lastUsedAt: string
  /** When the current Minecraft session expires (ISO). */
  expiresAt: string
  /** True when a silent refresh failed and the user must sign in again. */
  needsReauth: boolean
  isActive: boolean
}

export interface ProfileSkin {
  id: string
  state: 'ACTIVE' | 'INACTIVE'
  url: string
  variant: 'CLASSIC' | 'SLIM'
  textureKey: string | null
}

export interface ProfileCape {
  id: string
  state: 'ACTIVE' | 'INACTIVE'
  url: string
  alias: string
}

export interface MinecraftProfile {
  id: string
  name: string
  skins: ProfileSkin[]
  capes: ProfileCape[]
}

export type LoginMethod = 'browser' | 'device'

export interface DeviceCodeInfo {
  userCode: string
  verificationUri: string
  expiresAt: string
  message: string
}

export type LoginStage =
  | 'microsoft'
  | 'xbox'
  | 'xsts'
  | 'minecraft'
  | 'entitlements'
  | 'profile'
  | 'done'

export interface LoginProgress {
  stage: LoginStage
  label: string
}
