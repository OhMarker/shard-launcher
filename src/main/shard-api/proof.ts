/**
 * Proof of account for the Shard API (shard-api/API.md "Identity"). Every Minecraft account has a
 * key pair that Mojang signs (the one used to sign chat). The launcher fetches it with the
 * account's access token and signs the API's one-time challenge with it; the API checks Mojang's
 * signature itself. Mojang refuses requests from Cloudflare, so the API cannot ask Mojang.
 */
import { createPrivateKey, sign, type KeyObject } from 'node:crypto'
import { z } from 'zod'
import { uuidWithoutDashes } from '@shared/format'

/** POST https://api.minecraftservices.com/player/certificates */
export const CertificateResponseSchema = z.object({
  keyPair: z.object({ privateKey: z.string().min(1), publicKey: z.string().min(1) }),
  publicKeySignatureV2: z.string().min(1),
  expiresAt: z.string().min(1),
  refreshedAfter: z.string().min(1)
})
export type MojangCertificate = z.infer<typeof CertificateResponseSchema>

export interface PlayerProof {
  uuid: string
  publicKey: string
  keySignature: string
  expiresAt: number
  signature: string
}

/** Base64 body of a PEM block (Mojang labels them "RSA" keys but they are PKCS#8 / X.509). */
export function pemBody(pem: string): Buffer {
  return Buffer.from(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64')
}

function privateKey(pem: string): KeyObject {
  const der = pemBody(pem)
  try {
    return createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })
  } catch {
    return createPrivateKey({ key: der, format: 'der', type: 'pkcs1' })
  }
}

export function challengeMessage(serverId: string): string {
  return `shard-auth:${serverId}`
}

/** Signs the challenge with the account's key and packages what the API needs to check it. */
export function buildProof(cert: MojangCertificate, uuid: string, serverId: string): PlayerProof {
  const expiresAt = Date.parse(cert.expiresAt)
  if (!Number.isFinite(expiresAt)) throw new Error('Mojang sent a certificate without a valid expiry')
  const signature = sign('sha256', Buffer.from(challengeMessage(serverId), 'utf8'), privateKey(cert.keyPair.privateKey))
  return {
    uuid: uuidWithoutDashes(uuid),
    publicKey: pemBody(cert.keyPair.publicKey).toString('base64'),
    keySignature: cert.publicKeySignatureV2,
    expiresAt,
    signature: signature.toString('base64')
  }
}

/** True while the certificate can still be used (Mojang suggests a refresh time before expiry). */
export function certificateFresh(cert: MojangCertificate, now: number): boolean {
  const refresh = Date.parse(cert.refreshedAfter)
  return Number.isFinite(refresh) && now < refresh && now < Date.parse(cert.expiresAt) - 60_000
}
