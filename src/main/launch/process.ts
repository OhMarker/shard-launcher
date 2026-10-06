/** Child-process helpers for the launch pipeline: hooks, spawn hand-shake, exit codes, kill. */
import { spawn, type ChildProcess } from 'node:child_process'
import { constants as osConstants } from 'node:os'
import { type ConsoleLevel } from '@shared/types'

export const KILL_GRACE_MS = 5000

export type ProcessEnv = NodeJS.ProcessEnv

export interface HookOptions {
  cwd: string
  env: ProcessEnv
  onLine: (text: string, level: ConsoleLevel) => void
}

/** Runs a user hook through the system shell and resolves with its exit code. */
export function runHook(command: string, options: HookOptions): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const forward = (level: ConsoleLevel) => (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split(/\r?\n/)) {
        if (line.trim()) options.onLine(line, level)
      }
    }
    child.stdout?.on('data', forward('info'))
    child.stderr?.on('data', forward('warn'))
    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 1))
  })
}

/** Resolves once the OS has started the process, rejects when it could not be started. */
export function waitForSpawn(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error): void => {
      child.off('spawn', onSpawn)
      reject(err)
    }
    const onSpawn = (): void => {
      child.off('error', onError)
      resolve()
    }
    child.once('spawn', onSpawn)
    child.once('error', onError)
  })
}

/** Exit code as the renderer shows it: the real code, or 128 + signal number when signalled. */
export function exitCodeFrom(code: number | null, signal: NodeJS.Signals | null): number | null {
  if (code !== null) return code
  if (signal) return 128 + (osConstants.signals[signal] ?? 0)
  return null
}

/** Exit codes produced by a deliberate stop rather than a crash. */
export function isKilledExitCode(code: number | null): boolean {
  return code === 130 || code === 137 || code === 143
}

function taskkill(pid: number, force: boolean): Promise<void> {
  return new Promise((resolve) => {
    const args = ['/PID', String(pid), '/T']
    if (force) args.push('/F')
    const child = spawn('taskkill', args, { windowsHide: true, stdio: 'ignore' })
    child.on('error', () => resolve())
    child.on('close', () => resolve())
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Asks the game to close, then forces it after the grace period. On Windows the gentle
 * request is `taskkill /T` (WM_CLOSE to the game window) because signals do not exist there.
 */
export async function terminate(child: ChildProcess, pid: number, exited: Promise<void>): Promise<void> {
  if (process.platform === 'win32') await taskkill(pid, false)
  else child.kill('SIGTERM')

  const graceful = await Promise.race([exited.then(() => true), delay(KILL_GRACE_MS).then(() => false)])
  if (graceful) return

  if (process.platform === 'win32') await taskkill(pid, true)
  else child.kill('SIGKILL')
  await Promise.race([exited, delay(KILL_GRACE_MS)])
}
