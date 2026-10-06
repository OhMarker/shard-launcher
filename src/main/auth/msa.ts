/**
 * Microsoft identity platform (consumers tenant): authorization-code + PKCE in a sandboxed
 * BrowserWindow, device-code fallback, and refresh-token rotation. Only Microsoft tokens are
 * handled here; the Xbox/Minecraft chain lives in chain.ts.
 */
import { createHash, randomBytes } from 'node:crypto'
import { BrowserWindow, type Event as ElectronEvent } from 'electron'
import { MSA } from '@shared/constants'
import { ShardError } from '@shared/errors'
import {
  DeviceCodeResponseSchema,
  MsaErrorResponseSchema,
  MsaTokenResponseSchema,
  type DeviceCodeResponse,
  type MsaTokenResponse
} from '@shared/schemas/auth'
import { type DeviceCodeInfo } from '@shared/types'
import { type AppContext } from '@main/context'
import { createLogger } from '@main/logger'
import { HttpError, postForm } from '@main/net/http'

const log = createLogger('auth:msa')

export interface MsaTokens {
  accessToken: string
  refreshToken: string
  expiresAt: string
}

const TOKEN_URL = `${MSA.authority}/token`
const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'
const DEFAULT_POLL_INTERVAL_S = 5
/** Chromium's ERR_ABORTED, emitted for navigations we cancelled ourselves. */
const ERR_ABORTED = -3

function requireClientId(ctx: AppContext): string {
  const id = ctx.msaClientId()
  if (!id) {
    throw new ShardError('AUTH_NOT_CONFIGURED', 'Set MSA_CLIENT_ID or add a client id in Settings', { recoverable: true })
  }
  return id
}

function cancelled(message = 'Sign-in cancelled'): ShardError {
  return new ShardError('AUTH_CANCELLED', message)
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(cancelled())
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(cancelled())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** First sentence of an MSA error_description (they end with trace and correlation ids). */
function firstSentence(text: string): string {
  const line = text.split(/\r?\n/)[0] ?? text
  const match = /^(.*?[.!?])(?:\s|$)/.exec(line)
  return (match?.[1] ?? line).trim()
}

function describeMsaError(err: unknown): { error: string; description: string } | null {
  if (!(err instanceof HttpError)) return null
  const parsed = MsaErrorResponseSchema.safeParse(err.json())
  if (!parsed.success) return null
  return {
    error: parsed.data.error,
    description: parsed.data.error_description ? firstSentence(parsed.data.error_description) : ''
  }
}

function tokenError(err: unknown, context: 'login' | 'refresh'): ShardError {
  const msa = describeMsaError(err)
  if (!msa) return ShardError.from(err)
  if (context === 'refresh' && msa.error === 'invalid_grant') {
    return new ShardError('AUTH_REFRESH_FAILED', 'Your Microsoft sign-in has expired. Please sign in again.', {
      cause: err
    })
  }
  return new ShardError('AUTH_FAILED', `Microsoft sign-in failed: ${msa.description || msa.error}`, {
    cause: err,
    details: { error: msa.error }
  })
}

function toTokens(res: MsaTokenResponse, previousRefreshToken?: string): MsaTokens {
  const refreshToken = res.refresh_token ?? previousRefreshToken
  if (!refreshToken) {
    throw new ShardError(
      'AUTH_FAILED',
      'Microsoft did not return a refresh token. Make sure the app registration allows the offline_access scope.'
    )
  }
  return {
    accessToken: res.access_token,
    refreshToken,
    expiresAt: new Date(Date.now() + res.expires_in * 1000).toISOString()
  }
}

// ---------------------------------------------------------------------------
// Authorization code + PKCE
// ---------------------------------------------------------------------------

interface AuthorizeParams {
  clientId: string
  redirectUri: string
  challenge: string
  state: string
}

function authorizeUrl(p: AuthorizeParams): string {
  const url = new URL(`${MSA.authority}/authorize`)
  url.search = new URLSearchParams({
    client_id: p.clientId,
    response_type: 'code',
    redirect_uri: p.redirectUri,
    scope: MSA.scopes,
    response_mode: 'query',
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    state: p.state,
    prompt: 'select_account'
  }).toString()
  return url.toString()
}

type RedirectOutcome = { code: string } | { error: ShardError }

function parseRedirect(url: string, expectedState: string): RedirectOutcome {
  const params = new URL(url).searchParams
  const error = params.get('error')
  if (error) {
    if (error === 'access_denied') return { error: cancelled('Sign-in was cancelled') }
    const description = params.get('error_description')
    return {
      error: new ShardError('AUTH_FAILED', `Microsoft sign-in failed: ${description ? firstSentence(description) : error}`, {
        details: { error }
      })
    }
  }
  if (params.get('state') !== expectedState) {
    return { error: new ShardError('AUTH_FAILED', 'The sign-in response did not match this request. Please try again.') }
  }
  const code = params.get('code')
  if (!code) return { error: new ShardError('AUTH_FAILED', 'Microsoft did not return an authorization code.') }
  return { code }
}

/**
 * Opens the Microsoft sign-in page in an isolated window and resolves with the authorization
 * code. The loopback redirect is cancelled before it loads (there is no local HTTP server), so
 * the code only ever exists in memory.
 */
function authorizeInWindow(ctx: AppContext, params: AuthorizeParams, signal: AbortSignal): Promise<string> {
  if (signal.aborted) return Promise.reject(cancelled())
  return new Promise<string>((resolve, reject) => {
    const win = new BrowserWindow({
      width: 520,
      height: 680,
      parent: ctx.getWindow() ?? undefined,
      show: false,
      autoHideMenuBar: true,
      title: 'Sign in to Microsoft',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition: 'persist:msa-login'
      }
    })
    const { webContents } = win
    const { session } = webContents
    let settled = false

    const finish = (outcome: RedirectOutcome): void => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      session.webRequest.onBeforeRequest(null)
      if (!win.isDestroyed()) win.destroy()
      if ('code' in outcome) resolve(outcome.code)
      else reject(outcome.error)
    }
    const onAbort = (): void => finish({ error: cancelled() })

    const handleRedirect = (url: string): boolean => {
      if (!url.startsWith(params.redirectUri)) return false
      finish(parseRedirect(url, params.state))
      return true
    }

    try {
      session.webRequest.onBeforeRequest({ urls: [`${params.redirectUri}*`] }, (details, callback) => {
        callback({ cancel: true })
        handleRedirect(details.url)
      })
    } catch (err) {
      log.warn('Could not intercept the redirect URI at the network layer; relying on navigation events', err)
    }

    const onNavigate = (event: ElectronEvent, url: string): void => {
      if (handleRedirect(url)) event.preventDefault()
    }
    webContents.on('will-redirect', onNavigate)
    webContents.on('will-navigate', onNavigate)
    webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame || errorCode === ERR_ABORTED || validatedUrl.startsWith(params.redirectUri)) return
      finish({
        error: new ShardError('OFFLINE', `Could not load the Microsoft sign-in page (${errorDescription}).`)
      })
    })
    win.once('ready-to-show', () => win.show())
    win.on('closed', () => finish({ error: cancelled('The sign-in window was closed') }))
    signal.addEventListener('abort', onAbort, { once: true })

    win.loadURL(authorizeUrl(params)).catch((err: unknown) => finish({ error: ShardError.from(err, 'OFFLINE') }))
  })
}

async function exchangeCode(
  clientId: string,
  code: string,
  verifier: string,
  redirectUri: string,
  signal: AbortSignal
): Promise<MsaTokens> {
  try {
    const res = await postForm(
      TOKEN_URL,
      {
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        scope: MSA.scopes
      },
      MsaTokenResponseSchema,
      { retries: 0, signal }
    )
    return toTokens(res)
  } catch (err) {
    throw tokenError(err, 'login')
  }
}

export async function loginWithBrowser(ctx: AppContext, signal: AbortSignal): Promise<MsaTokens> {
  const clientId = requireClientId(ctx)
  const redirectUri = ctx.msaRedirectUri()
  const verifier = randomBytes(64).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(16).toString('hex')
  const code = await authorizeInWindow(ctx, { clientId, redirectUri, challenge, state }, signal)
  log.info('Authorization code received, exchanging for tokens')
  return exchangeCode(clientId, code, verifier, redirectUri, signal)
}

// ---------------------------------------------------------------------------
// Device code
// ---------------------------------------------------------------------------

export async function loginWithDeviceCode(
  ctx: AppContext,
  signal: AbortSignal,
  onCode: (info: DeviceCodeInfo) => void
): Promise<MsaTokens> {
  const clientId = requireClientId(ctx)
  let device: DeviceCodeResponse
  try {
    device = await postForm(
      `${MSA.authority}/devicecode`,
      { client_id: clientId, scope: MSA.scopes },
      DeviceCodeResponseSchema,
      { retries: 1, signal }
    )
  } catch (err) {
    throw signal.aborted ? cancelled() : tokenError(err, 'login')
  }

  const expiresAt = Date.now() + device.expires_in * 1000
  let intervalMs = (device.interval ?? DEFAULT_POLL_INTERVAL_S) * 1000
  onCode({
    userCode: device.user_code,
    verificationUri: device.verification_uri,
    expiresAt: new Date(expiresAt).toISOString(),
    message: device.message ?? `Go to ${device.verification_uri} and enter the code ${device.user_code}`
  })
  log.info('Device code issued, waiting for approval')

  for (;;) {
    await sleep(intervalMs, signal)
    if (Date.now() > expiresAt) {
      throw new ShardError('AUTH_FAILED', 'The code expired. Start the sign-in again to get a new one.')
    }
    try {
      const res = await postForm(
        TOKEN_URL,
        { client_id: clientId, grant_type: DEVICE_CODE_GRANT, device_code: device.device_code },
        MsaTokenResponseSchema,
        { retries: 0, signal }
      )
      return toTokens(res)
    } catch (err) {
      if (signal.aborted) throw cancelled()
      switch (describeMsaError(err)?.error) {
        case 'authorization_pending':
          continue
        case 'slow_down':
          intervalMs += 5_000
          continue
        case 'expired_token':
          throw new ShardError('AUTH_FAILED', 'The code expired. Start the sign-in again to get a new one.')
        case 'authorization_declined':
          throw cancelled('Sign-in was declined')
        default:
          throw tokenError(err, 'login')
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

/** Refresh tokens rotate: callers must persist the returned `refreshToken`. */
export async function refreshTokens(ctx: AppContext, refreshToken: string): Promise<MsaTokens> {
  const clientId = requireClientId(ctx)
  try {
    const res = await postForm(
      TOKEN_URL,
      { client_id: clientId, grant_type: 'refresh_token', refresh_token: refreshToken, scope: MSA.scopes },
      MsaTokenResponseSchema,
      { retries: 1 }
    )
    return toTokens(res, refreshToken)
  } catch (err) {
    throw tokenError(err, 'refresh')
  }
}
