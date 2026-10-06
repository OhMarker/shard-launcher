import { URLS } from '@shared/constants'
import { ShardError, type ShardErrorCode } from '@shared/errors'
import { uuidWithoutDashes } from '@shared/format'
import { type AccountSecrets, type StoredAccount } from '@shared/schemas/accounts'
import { type AccountSummary, type LoginMethod, type LoginStage, type MinecraftProfile } from '@shared/types'
import { type AccountService, type AppContext, type GameSession } from '@main/context'
import { handle } from '@main/ipc/router'
import { createLogger } from '@main/logger'
import { getDefaultUserAgent, toNetworkError } from '@main/net/http'
import { fetchProfile, LOGIN_STAGE_LABELS, runChain, type ChainResult } from './chain'
import { loginWithBrowser, loginWithDeviceCode, refreshTokens } from './msa'
import { AccountStore, type AccountRecord } from './store'

const log = createLogger('auth')

/** Refresh when the Minecraft token has less than this left. */
const REFRESH_WINDOW_MS = 5 * 60_000
const PROFILE_CACHE_MS = 60_000
const SERVICES_TIMEOUT_MS = 30_000

/** Failures that mean the saved sign-in is unusable, as opposed to a flaky network. */
const REAUTH_CODES: ReadonlySet<ShardErrorCode> = new Set<ShardErrorCode>([
  'AUTH_REFRESH_FAILED',
  'AUTH_FAILED',
  'AUTH_NO_XBOX_PROFILE',
  'AUTH_CHILD_ACCOUNT',
  'AUTH_REGION_BLOCKED',
  'AUTH_ADULT_VERIFICATION',
  'AUTH_BANNED',
  'AUTH_NO_GAME',
  'AUTH_NO_PROFILE'
])

type ProfileFields = Pick<AccountRecord, 'username' | 'skinUrl' | 'skinVariant' | 'capeUrl'>

function profileFields(profile: MinecraftProfile): ProfileFields {
  const skin = profile.skins.find((s) => s.state === 'ACTIVE')
  const cape = profile.capes.find((c) => c.state === 'ACTIVE')
  return {
    username: profile.name,
    skinUrl: skin?.url ?? null,
    skinVariant: skin?.variant === 'SLIM' ? 'slim' : 'classic',
    capeUrl: cape?.url ?? null
  }
}

function toSession(account: StoredAccount, secrets: AccountSecrets): GameSession {
  return {
    accountId: account.id,
    username: account.username,
    uuid: account.id,
    accessToken: secrets.mcAccessToken,
    xuid: secrets.xuid,
    userType: 'msa',
    expiresAt: secrets.mcExpiresAt
  }
}

class AccountServiceImpl implements AccountService {
  private readonly store: AccountStore
  private loginAbort: AbortController | null = null
  private readonly refreshing = new Map<string, Promise<GameSession>>()
  private readonly profiles = new Map<string, { profile: MinecraftProfile; fetchedAt: number }>()

  constructor(private readonly ctx: AppContext) {
    this.store = new AccountStore(ctx.paths.accountsFile)
  }

  list(): AccountSummary[] {
    return this.store.summaries()
  }

  getActive(): AccountSummary | null {
    return this.store.summaries().find((s) => s.isActive) ?? null
  }

  setActive(id: string): AccountSummary {
    this.store.setActive(id).catch((err: unknown) => log.error('Failed to save the active account', err))
    this.emitChanged()
    return this.summaryOf(id)
  }

  isConfigured(): boolean {
    return this.ctx.msaClientId() !== null
  }

  async login(method: LoginMethod): Promise<AccountSummary> {
    if (this.loginAbort) throw new ShardError('AUTH_FAILED', 'A sign-in is already in progress')
    const abort = new AbortController()
    this.loginAbort = abort
    try {
      this.progress('microsoft')
      const tokens =
        method === 'browser'
          ? await loginWithBrowser(this.ctx, abort.signal)
          : await loginWithDeviceCode(this.ctx, abort.signal, (info) => this.ctx.emit('auth:deviceCode', info))
      const result = await runChain(tokens.accessToken, {
        onStage: (stage) => this.progress(stage),
        userAgent: getDefaultUserAgent(),
        signal: abort.signal
      })
      const id = await this.persist(result, tokens.refreshToken)
      await this.store.setActive(id)
      this.emitChanged()
      log.info(`Signed in as ${result.profile.name}`)
      return this.summaryOf(id)
    } catch (err) {
      if (abort.signal.aborted) throw new ShardError('AUTH_CANCELLED', 'Sign-in cancelled', { cause: err })
      throw err
    } finally {
      this.loginAbort = null
    }
  }

  cancelLogin(): void {
    this.loginAbort?.abort()
  }

  async logout(id: string): Promise<void> {
    const account = this.requireAccount(id)
    await this.store.remove(id)
    this.profiles.delete(id)
    this.emitChanged()
    log.info(`Signed out ${account.username}`)
  }

  async refresh(id: string): Promise<AccountSummary> {
    const session = await this.refreshSession(id)
    return this.summaryOf(session.accountId)
  }

  async getSession(id?: string): Promise<GameSession> {
    const account = this.resolveAccount(id)
    const secrets = this.requireSecrets(account.id)
    if (Date.parse(secrets.mcExpiresAt) - Date.now() > REFRESH_WINDOW_MS) return toSession(account, secrets)
    return this.refreshSession(account.id)
  }

  getLastKnownSession(id?: string): GameSession | null {
    const account = id ? this.store.get(id) : this.store.getActive()
    if (!account) return null
    const secrets = this.readSecrets(account.id)
    return secrets ? toSession(account, secrets) : null
  }

  async getProfile(id?: string, refresh = false): Promise<MinecraftProfile> {
    const account = this.resolveAccount(id)
    const cached = this.profiles.get(account.id)
    if (!refresh && cached && Date.now() - cached.fetchedAt < PROFILE_CACHE_MS) return cached.profile
    const session = await this.getSession(account.id)
    const profile = await fetchProfile(session.accessToken, { userAgent: getDefaultUserAgent() })
    if (!profile) {
      throw new ShardError(
        'AUTH_NO_PROFILE',
        'Your account owns Minecraft but has no Java Edition profile yet. Create one at minecraft.net and sign in again.'
      )
    }
    this.profiles.set(account.id, { profile, fetchedAt: Date.now() })
    await this.syncProfileFields(account.id, profile)
    return profile
  }

  async servicesFetch(path: string, init: RequestInit & { accountId?: string } = {}): Promise<Response> {
    const { accountId, headers, signal, ...rest } = init
    const session = await this.getSession(accountId)
    const merged = new Headers(headers)
    merged.set('Authorization', `Bearer ${session.accessToken}`)
    if (!merged.has('User-Agent')) merged.set('User-Agent', getDefaultUserAgent())
    const url = `${URLS.minecraftServices}${path}`
    try {
      return await fetch(url, { ...rest, headers: merged, signal: signal ?? AbortSignal.timeout(SERVICES_TIMEOUT_MS) })
    } catch (err) {
      throw toNetworkError(err, url)
    }
  }

  async refreshAllOnStartup(): Promise<void> {
    const active = this.store.getActive()
    if (!active) return
    if (!this.isConfigured()) {
      log.warn('Skipping the startup session refresh: no MSA client id is configured')
      return
    }
    try {
      await this.refreshSession(active.id)
      log.info(`Refreshed the session for ${active.username}`)
    } catch (err) {
      const e = ShardError.from(err)
      log.warn(`Startup session refresh for ${active.username} failed: [${e.code}] ${e.message}`)
    }
  }

  // -------------------------------------------------------------------------

  private resolveAccount(id?: string): StoredAccount {
    if (id) return this.requireAccount(id)
    const active = this.store.getActive()
    if (!active) throw new ShardError('ACCOUNT_REQUIRED', 'Sign in with a Microsoft account to continue')
    return active
  }

  private requireAccount(id: string): StoredAccount {
    const account = this.store.get(id)
    if (!account) throw new ShardError('NOT_FOUND', `No account with id ${id}`)
    return account
  }

  private summaryOf(id: string): AccountSummary {
    const summary = this.store.summary(id)
    if (!summary) throw new ShardError('NOT_FOUND', `No account with id ${id}`)
    return summary
  }

  /** Secrets or null; a failed decrypt has already flagged the account, so tell the renderer. */
  private readSecrets(id: string): AccountSecrets | null {
    const secrets = this.store.getSecrets(id)
    if (!secrets) this.emitChanged()
    return secrets
  }

  private requireSecrets(id: string): AccountSecrets {
    const secrets = this.readSecrets(id)
    if (!secrets) {
      throw new ShardError('AUTH_REFRESH_FAILED', 'Your saved sign-in could not be read. Please sign in again.')
    }
    return secrets
  }

  /** Deduplicates concurrent refreshes of the same account (launch + profile fetch, for example). */
  private refreshSession(id: string): Promise<GameSession> {
    const pending = this.refreshing.get(id)
    if (pending) return pending
    const task = this.doRefresh(id).finally(() => this.refreshing.delete(id))
    this.refreshing.set(id, task)
    return task
  }

  private async doRefresh(id: string): Promise<GameSession> {
    const account = this.requireAccount(id)
    const secrets = this.requireSecrets(id)
    try {
      const tokens = await refreshTokens(this.ctx, secrets.msaRefreshToken)
      const result = await runChain(tokens.accessToken, { userAgent: getDefaultUserAgent() })
      const newId = await this.persist(result, tokens.refreshToken, account.id)
      this.emitChanged()
      return toSession(this.requireAccount(newId), this.requireSecrets(newId))
    } catch (err) {
      const e = ShardError.from(err)
      const current = this.store.get(id)
      if (current && REAUTH_CODES.has(e.code) && !current.needsReauth) {
        log.warn(`Session refresh for ${current.username} failed permanently: [${e.code}] ${e.message}`)
        await this.store
          .update(id, { needsReauth: true })
          .catch((writeErr: unknown) => log.error('Failed to write accounts.json', writeErr))
        this.emitChanged()
      }
      throw e
    }
  }

  /**
   * Writes a chain result and the rotated refresh token. Returns the account id, which can
   * differ from `previousId` in the rare case the Java profile was recreated.
   */
  private async persist(result: ChainResult, refreshToken: string, previousId?: string): Promise<string> {
    const id = uuidWithoutDashes(result.profile.id)
    const now = new Date().toISOString()
    const previous = this.store.get(previousId ?? id)
    const previousSecrets = previous ? this.store.getSecrets(previous.id) : null
    const wasActive = previous !== null && this.store.activeId() === previous.id

    if (previous && previous.id !== id) {
      log.warn(`Profile id changed for ${result.profile.name}; replacing the stored account`)
      await this.store.remove(previous.id)
      this.profiles.delete(previous.id)
    }

    const xuid = result.xuid || previousSecrets?.xuid || ''
    const record: AccountRecord = {
      id,
      ...profileFields(result.profile),
      xuid: xuid || previous?.xuid || null,
      addedAt: previous?.addedAt ?? now,
      lastUsedAt: now,
      expiresAt: result.mcExpiresAt,
      needsReauth: false
    }
    await this.store.upsert(record, {
      msaRefreshToken: refreshToken,
      mcAccessToken: result.mcAccessToken,
      mcExpiresAt: result.mcExpiresAt,
      xuid
    })
    if (wasActive && this.store.activeId() !== id) await this.store.setActive(id)
    this.profiles.set(id, { profile: result.profile, fetchedAt: Date.now() })
    return id
  }

  private async syncProfileFields(id: string, profile: MinecraftProfile): Promise<void> {
    const account = this.store.get(id)
    if (!account) return
    const fields = profileFields(profile)
    const changed = (Object.keys(fields) as Array<keyof ProfileFields>).some((key) => account[key] !== fields[key])
    if (!changed) return
    await this.store.update(id, fields)
    this.emitChanged()
  }

  private emitChanged(): void {
    this.ctx.emit('auth:accountsChanged', this.store.summaries())
  }

  private progress(stage: LoginStage): void {
    this.ctx.emit('auth:loginProgress', { stage, label: LOGIN_STAGE_LABELS[stage] })
  }
}

export function createAccountService(ctx: AppContext): AccountService {
  return new AccountServiceImpl(ctx)
}

export function registerAuthIpc(ctx: AppContext): void {
  const accounts = (): AccountService => ctx.services.accounts
  handle('auth:listAccounts', () => accounts().list())
  handle('auth:getActive', () => accounts().getActive())
  handle('auth:setActive', ({ id }) => accounts().setActive(id))
  handle('auth:login', ({ method }) => accounts().login(method))
  handle('auth:cancelLogin', () => accounts().cancelLogin())
  handle('auth:logout', ({ id }) => accounts().logout(id))
  handle('auth:refresh', ({ id }) => accounts().refresh(id))
  handle('auth:getProfile', ({ id, refresh }) => accounts().getProfile(id, refresh))
}
