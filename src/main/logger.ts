import { join } from 'node:path'
import { renameSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import log from 'electron-log/main'

const MAX_LOG_BYTES = 5 * 1024 * 1024
const MAX_ARCHIVES = 5

/** Anything that looks like a bearer token, JWT, or auth form value is scrubbed before it hits disk. */
const REDACTIONS: Array<[RegExp, string]> = [
  [/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[jwt]'],
  [/(access_token|refresh_token|id_token|client_secret|code_verifier|device_code)=([^&\s"']+)/gi, '$1=[redacted]'],
  [/("(?:access_token|refresh_token|id_token|Token|RpsTicket|identityToken|accessToken|refreshToken)"\s*:\s*")[^"]+(")/g, '$1[redacted]$2'],
  [/(Authorization:\s*\w+\s+)\S+/gi, '$1[redacted]'],
  [/(XBL3\.0 x=)[^;\s]+;[^\s"']+/g, '$1[redacted]']
]

export function redact(text: string): string {
  let out = text
  for (const [re, replacement] of REDACTIONS) out = out.replace(re, replacement)
  return out
}

function archiveLog(file: { path: string }): void {
  const dir = join(file.path, '..')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  try {
    renameSync(file.path, join(dir, `launcher-${stamp}.log`))
  } catch {
    // If the rename fails electron-log will truncate the file instead.
  }
  try {
    const archives = readdirSync(dir)
      .filter((n) => /^launcher-.*\.log$/.test(n))
      .map((n) => ({ n, t: statSync(join(dir, n)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    for (const old of archives.slice(MAX_ARCHIVES)) unlinkSync(join(dir, old.n))
  } catch {
    // best effort
  }
}

export function initLogging(logsDir: string, isDev: boolean): void {
  log.initialize({ preload: false })
  log.transports.file.resolvePathFn = () => join(logsDir, 'launcher.log')
  log.transports.file.maxSize = MAX_LOG_BYTES
  log.transports.file.archiveLogFn = archiveLog
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}]{scope} {text}'
  log.transports.file.level = isDev ? 'debug' : 'info'
  log.transports.console.level = isDev ? 'debug' : 'warn'
  log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}]{scope} {text}'
  log.hooks.push((message) => {
    message.data = message.data.map((d: unknown) => {
      if (typeof d === 'string') return redact(d)
      if (d instanceof Error) {
        const e = new Error(redact(d.message))
        e.name = d.name
        e.stack = d.stack ? redact(d.stack) : undefined
        return e
      }
      if (d && typeof d === 'object') {
        try {
          return JSON.parse(redact(JSON.stringify(d)))
        } catch {
          return d
        }
      }
      return d
    })
    return message
  })
  log.errorHandler.startCatching({ showDialog: false })
}

export function logsDirExists(logsDir: string): boolean {
  return existsSync(logsDir)
}

export type Logger = ReturnType<typeof log.scope>

export function createLogger(scope: string): Logger {
  return log.scope(scope)
}

export const rootLogger = log
