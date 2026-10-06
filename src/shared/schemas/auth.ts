import { z } from 'zod'

/** Microsoft identity platform token endpoint. */
export const MsaTokenResponseSchema = z.object({
  token_type: z.string(),
  scope: z.string().optional(),
  expires_in: z.number(),
  ext_expires_in: z.number().optional(),
  access_token: z.string(),
  refresh_token: z.string().optional(),
  id_token: z.string().optional()
})
export type MsaTokenResponse = z.infer<typeof MsaTokenResponseSchema>

export const MsaErrorResponseSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
  error_codes: z.array(z.number()).optional()
})

export const DeviceCodeResponseSchema = z.object({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri: z.string(),
  expires_in: z.number(),
  interval: z.number().optional(),
  message: z.string().optional()
})
export type DeviceCodeResponse = z.infer<typeof DeviceCodeResponseSchema>

/** Shared by user.auth.xboxlive.com and xsts.auth.xboxlive.com success bodies. */
export const XboxTokenResponseSchema = z.object({
  IssueInstant: z.string().optional(),
  NotAfter: z.string().optional(),
  Token: z.string(),
  DisplayClaims: z.object({
    xui: z.array(
      z.object({
        uhs: z.string(),
        xid: z.string().optional(),
        gtg: z.string().optional()
      })
    )
  })
})
export type XboxTokenResponse = z.infer<typeof XboxTokenResponseSchema>

export const XstsErrorResponseSchema = z.object({
  Identity: z.string().optional(),
  XErr: z.number(),
  Message: z.string().optional(),
  Redirect: z.string().optional()
})

export const MinecraftLoginResponseSchema = z.object({
  username: z.string(),
  roles: z.array(z.unknown()).optional(),
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number()
})
export type MinecraftLoginResponse = z.infer<typeof MinecraftLoginResponseSchema>

export const EntitlementsResponseSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      signature: z.string().optional()
    })
  ),
  signature: z.string().optional(),
  keyId: z.string().optional()
})
export type EntitlementsResponse = z.infer<typeof EntitlementsResponseSchema>

export const MinecraftProfileResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  skins: z
    .array(
      z.object({
        id: z.string(),
        state: z.string(),
        url: z.string(),
        textureKey: z.string().optional(),
        variant: z.string(),
        alias: z.string().optional()
      })
    )
    .default([]),
  capes: z
    .array(
      z.object({
        id: z.string(),
        state: z.string(),
        url: z.string(),
        alias: z.string().optional()
      })
    )
    .default([]),
  profileActions: z.unknown().optional()
})
export type MinecraftProfileResponse = z.infer<typeof MinecraftProfileResponseSchema>

export const MinecraftServicesErrorSchema = z.object({
  path: z.string().optional(),
  errorType: z.string().optional(),
  error: z.string().optional(),
  errorMessage: z.string().optional(),
  developerMessage: z.string().optional()
})
