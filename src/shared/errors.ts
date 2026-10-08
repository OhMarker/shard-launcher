/** Error codes that cross the IPC boundary. Keep them stable: the renderer maps them to copy. */
export type ShardErrorCode =
  | 'UNKNOWN'
  | 'INVALID_INPUT'
  | 'OFFLINE'
  | 'HTTP'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'IO'
  | 'CHECKSUM_MISMATCH'
  | 'RATE_LIMITED'
  | 'AUTH_NOT_CONFIGURED'
  | 'AUTH_CANCELLED'
  | 'AUTH_FAILED'
  | 'AUTH_REFRESH_FAILED'
  | 'AUTH_NO_XBOX_PROFILE'
  | 'AUTH_CHILD_ACCOUNT'
  | 'AUTH_REGION_BLOCKED'
  | 'AUTH_ADULT_VERIFICATION'
  | 'AUTH_BANNED'
  | 'AUTH_NO_GAME'
  | 'AUTH_NO_PROFILE'
  | 'ACCOUNT_REQUIRED'
  | 'JAVA_NOT_FOUND'
  | 'JAVA_INVALID'
  | 'JAVA_DOWNLOAD_FAILED'
  | 'VERSION_UNSUPPORTED'
  | 'VERSION_NOT_FOUND'
  | 'FABRIC_UNAVAILABLE'
  | 'INSTANCE_RUNNING'
  | 'INSTANCE_BROKEN'
  | 'LAUNCH_FAILED'
  | 'MOD_LOCKED'
  | 'MOD_CONFLICT'
  | 'MOD_NO_COMPATIBLE_VERSION'
  | 'SKIN_INVALID'
  | 'MANIFEST_INVALID'
  | 'UPDATE_FAILED'
  | 'SHARD_API_UNAVAILABLE'
  | 'SHARD_API'

export interface SerializedError {
  __shardError: true
  code: ShardErrorCode
  message: string
  details?: unknown
  recoverable: boolean
}

export class ShardError extends Error {
  readonly code: ShardErrorCode
  readonly details: unknown
  readonly recoverable: boolean

  constructor(
    code: ShardErrorCode,
    message: string,
    options: { details?: unknown; recoverable?: boolean; cause?: unknown } = {}
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = 'ShardError'
    this.code = code
    this.details = options.details
    this.recoverable = options.recoverable ?? true
  }

  toJSON(): SerializedError {
    return {
      __shardError: true,
      code: this.code,
      message: this.message,
      details: this.details,
      recoverable: this.recoverable
    }
  }

  static from(err: unknown, fallbackCode: ShardErrorCode = 'UNKNOWN'): ShardError {
    if (err instanceof ShardError) return err
    if (isSerializedError(err)) {
      return new ShardError(err.code, err.message, {
        details: err.details,
        recoverable: err.recoverable
      })
    }
    if (err instanceof Error) {
      const code = errorCodeFromNodeError(err) ?? fallbackCode
      return new ShardError(code, err.message, { cause: err })
    }
    return new ShardError(fallbackCode, typeof err === 'string' ? err : 'Unknown error', {
      details: err
    })
  }
}

export function isSerializedError(value: unknown): value is SerializedError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __shardError?: unknown }).__shardError === true &&
    typeof (value as { code?: unknown }).code === 'string'
  )
}

function errorCodeFromNodeError(err: Error): ShardErrorCode | null {
  const code = (err as { code?: unknown }).code
  if (typeof code !== 'string') return null
  switch (code) {
    case 'ENOENT':
      return 'NOT_FOUND'
    case 'EEXIST':
      return 'ALREADY_EXISTS'
    case 'ENOTFOUND':
    case 'ECONNREFUSED':
    case 'ECONNRESET':
    case 'EAI_AGAIN':
    case 'ENETUNREACH':
      return 'OFFLINE'
    case 'ETIMEDOUT':
    case 'UND_ERR_CONNECT_TIMEOUT':
    case 'UND_ERR_HEADERS_TIMEOUT':
      return 'TIMEOUT'
    case 'ABORT_ERR':
      return 'CANCELLED'
    case 'EACCES':
    case 'EPERM':
    case 'EBUSY':
    case 'EISDIR':
    case 'ENOTDIR':
    case 'ENOSPC':
      return 'IO'
    default:
      return null
  }
}

/** Human-readable fallback copy for error codes, used when the message is too technical. */
export const ERROR_TITLES: Record<ShardErrorCode, string> = {
  UNKNOWN: 'Something went wrong',
  INVALID_INPUT: 'Invalid request',
  OFFLINE: 'You appear to be offline',
  HTTP: 'A server returned an error',
  TIMEOUT: 'The request timed out',
  CANCELLED: 'Cancelled',
  NOT_FOUND: 'Not found',
  ALREADY_EXISTS: 'Already exists',
  IO: 'File system error',
  CHECKSUM_MISMATCH: 'A downloaded file was corrupted',
  RATE_LIMITED: 'Slow down, you are being rate limited',
  AUTH_NOT_CONFIGURED: 'Sign-in is not configured',
  AUTH_CANCELLED: 'Sign-in cancelled',
  AUTH_FAILED: 'Sign-in failed',
  AUTH_REFRESH_FAILED: 'Please sign in again',
  AUTH_NO_XBOX_PROFILE: 'This Microsoft account has no Xbox profile',
  AUTH_CHILD_ACCOUNT: 'This account needs to be added to a family',
  AUTH_REGION_BLOCKED: 'Xbox Live is not available in your region',
  AUTH_ADULT_VERIFICATION: 'Adult verification required',
  AUTH_BANNED: 'This account is banned from Xbox Live',
  AUTH_NO_GAME: 'This account does not own Minecraft: Java Edition',
  AUTH_NO_PROFILE: 'This account has no Minecraft profile yet',
  ACCOUNT_REQUIRED: 'Sign in to continue',
  JAVA_NOT_FOUND: 'Java was not found',
  JAVA_INVALID: 'That Java installation is not usable',
  JAVA_DOWNLOAD_FAILED: 'Java could not be downloaded',
  VERSION_UNSUPPORTED: 'Unsupported Minecraft version',
  VERSION_NOT_FOUND: 'Minecraft version not found',
  FABRIC_UNAVAILABLE: 'Fabric is not available for this version yet',
  INSTANCE_RUNNING: 'This instance is already running',
  INSTANCE_BROKEN: 'This instance needs to be repaired',
  LAUNCH_FAILED: 'Launch failed',
  MOD_LOCKED: 'This mod is part of Shard Core and cannot be removed',
  MOD_CONFLICT: 'This mod conflicts with Shard',
  MOD_NO_COMPATIBLE_VERSION: 'No compatible version of this mod exists yet',
  SKIN_INVALID: 'That is not a valid Minecraft skin',
  MANIFEST_INVALID: 'A remote manifest was malformed',
  UPDATE_FAILED: 'Update failed',
  SHARD_API_UNAVAILABLE: 'Shard online features are not available yet',
  SHARD_API: 'Shard could not do that'
}
