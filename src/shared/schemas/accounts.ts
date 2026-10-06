import { z } from 'zod'

/** Plaintext payload that is encrypted with safeStorage and stored as `secrets`. */
export const AccountSecretsSchema = z.object({
  msaRefreshToken: z.string().min(1),
  mcAccessToken: z.string().min(1),
  mcExpiresAt: z.string(),
  /** Xbox user id, '' when the XSTS display claims did not include one. */
  xuid: z.string()
})
export type AccountSecrets = z.infer<typeof AccountSecretsSchema>

export const StoredAccountSchema = z.object({
  /** Minecraft profile UUID without dashes. */
  id: z.string().min(1),
  username: z.string(),
  xuid: z.string().nullable().default(null),
  skinUrl: z.string().nullable().default(null),
  skinVariant: z.enum(['classic', 'slim']).default('classic'),
  capeUrl: z.string().nullable().default(null),
  addedAt: z.string(),
  lastUsedAt: z.string(),
  /** When the current Minecraft session expires (ISO). */
  expiresAt: z.string(),
  needsReauth: z.boolean().default(false),
  /** Base64 of `safeStorage.encryptString(JSON.stringify(AccountSecrets))`. Never sent to the renderer. */
  secrets: z.string().min(1)
})
export type StoredAccount = z.infer<typeof StoredAccountSchema>

/** `accounts.json` in the config directory. */
export const AccountsFileSchema = z.object({
  version: z.literal(1),
  activeId: z.string().nullable().default(null),
  accounts: z.array(StoredAccountSchema).default([])
})
export type AccountsFile = z.infer<typeof AccountsFileSchema>
