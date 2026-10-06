/**
 * `accounts.json`: public account metadata plus one safeStorage-encrypted blob per account.
 * Loaded synchronously at construction (the service must answer `list()` right away) and
 * written atomically through a serial queue. safeStorage is only touched lazily because it is
 * unusable before `app.whenReady()`.
 */
import { readFileSync, renameSync } from 'node:fs'
import { safeStorage } from 'electron'
import { ShardError } from '@shared/errors'
import {
  AccountSecretsSchema,
  AccountsFileSchema,
  type AccountSecrets,
  type AccountsFile,
  type StoredAccount
} from '@shared/schemas/accounts'
import { type AccountSummary } from '@shared/types'
import { createLogger } from '@main/logger'
import { writeJson } from '@main/util/fs'

const log = createLogger('auth:store')

export type AccountRecord = Omit<StoredAccount, 'secrets'>

function emptyFile(): AccountsFile {
  return { version: 1, activeId: null, accounts: [] }
}

function encrypt(secrets: AccountSecrets): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new ShardError('AUTH_FAILED', 'Secure storage is unavailable on this system, so Shard cannot save your sign-in.')
  }
  return safeStorage.encryptString(JSON.stringify(secrets)).toString('base64')
}

function decrypt(blob: string): AccountSecrets | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    const parsed = AccountSecretsSchema.safeParse(JSON.parse(safeStorage.decryptString(Buffer.from(blob, 'base64'))))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Explicit field list so `secrets` can never leak into the renderer. */
function toSummary(account: StoredAccount, activeId: string | null): AccountSummary {
  return {
    id: account.id,
    username: account.username,
    xuid: account.xuid,
    skinUrl: account.skinUrl,
    skinVariant: account.skinVariant,
    capeUrl: account.capeUrl,
    addedAt: account.addedAt,
    lastUsedAt: account.lastUsedAt,
    expiresAt: account.expiresAt,
    needsReauth: account.needsReauth,
    isActive: account.id === activeId
  }
}

export class AccountStore {
  private file: AccountsFile
  private readonly decrypted = new Map<string, AccountSecrets>()
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly path: string) {
    this.file = this.read()
  }

  private read(): AccountsFile {
    let raw: string
    try {
      raw = readFileSync(this.path, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') log.warn(`Could not read ${this.path}`, err)
      return emptyFile()
    }
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      return this.quarantine('is not valid JSON')
    }
    const parsed = AccountsFileSchema.safeParse(json)
    if (parsed.success) return parsed.data
    return this.quarantine(`failed validation: ${parsed.error.issues[0]?.message ?? 'unknown issue'}`)
  }

  /** Moves an unreadable file aside instead of silently overwriting it on the next write. */
  private quarantine(reason: string): AccountsFile {
    const aside = `${this.path}.corrupt-${Date.now()}`
    log.error(`${this.path} ${reason}; moving it to ${aside} and starting with no accounts`)
    try {
      renameSync(this.path, aside)
    } catch (err) {
      log.error('Could not move the corrupt accounts file aside', err)
    }
    return emptyFile()
  }

  list(): StoredAccount[] {
    return this.file.accounts
  }

  get(id: string): StoredAccount | null {
    return this.file.accounts.find((a) => a.id === id) ?? null
  }

  private require(id: string): StoredAccount {
    const account = this.get(id)
    if (!account) throw new ShardError('NOT_FOUND', `No account with id ${id}`)
    return account
  }

  activeId(): string | null {
    return this.file.activeId
  }

  getActive(): StoredAccount | null {
    return this.file.activeId ? this.get(this.file.activeId) : null
  }

  summaries(): AccountSummary[] {
    return this.file.accounts.map((a) => toSummary(a, this.file.activeId))
  }

  summary(id: string): AccountSummary | null {
    const account = this.get(id)
    return account ? toSummary(account, this.file.activeId) : null
  }

  setActive(id: string | null): Promise<void> {
    if (id !== null) this.require(id)
    this.file.activeId = id
    return this.persist()
  }

  /** Inserts or replaces the account and its encrypted secrets. */
  upsert(record: AccountRecord, secrets: AccountSecrets): Promise<void> {
    const stored: StoredAccount = { ...record, secrets: encrypt(secrets) }
    const index = this.file.accounts.findIndex((a) => a.id === record.id)
    if (index === -1) this.file.accounts.push(stored)
    else this.file.accounts[index] = stored
    this.decrypted.set(record.id, secrets)
    return this.persist()
  }

  update(id: string, patch: Partial<Omit<AccountRecord, 'id'>>): Promise<void> {
    Object.assign(this.require(id), patch)
    return this.persist()
  }

  remove(id: string): Promise<void> {
    this.file.accounts = this.file.accounts.filter((a) => a.id !== id)
    this.decrypted.delete(id)
    if (this.file.activeId === id) this.file.activeId = this.file.accounts[0]?.id ?? null
    return this.persist()
  }

  /** Decrypts lazily. Returns null (and flags the account for re-auth) when the blob cannot be read. */
  getSecrets(id: string): AccountSecrets | null {
    const cached = this.decrypted.get(id)
    if (cached) return cached
    const account = this.get(id)
    if (!account) return null
    const secrets = decrypt(account.secrets)
    if (!secrets) {
      log.warn(`Stored credentials for ${account.username} could not be decrypted; sign-in required`)
      if (!account.needsReauth) {
        account.needsReauth = true
        this.persist().catch((err: unknown) => log.error('Failed to write accounts.json', err))
      }
      return null
    }
    this.decrypted.set(id, secrets)
    return secrets
  }

  /** Serialised atomic write. Rejections reach the caller; the queue itself never stalls. */
  private persist(): Promise<void> {
    const snapshot: AccountsFile = {
      version: 1,
      activeId: this.file.activeId,
      accounts: this.file.accounts.map((a) => ({ ...a }))
    }
    const write = this.writeQueue.then(() => writeJson(this.path, snapshot))
    this.writeQueue = write.catch(() => undefined)
    return write
  }
}
