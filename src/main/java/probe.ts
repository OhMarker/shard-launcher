/** Runs `java -version` to confirm a runtime works and learn its major version. */
import { spawn } from 'node:child_process'
import { type JavaValidation } from '@shared/types'
import { exists } from '../util/fs'
import { parseJavaVersion } from './version'

const PROBE_TIMEOUT_MS = 5000

function invalid(error: string): JavaValidation {
  return { valid: false, version: null, major: null, error }
}

/** Combined stdout + stderr of `<path> -version`, rejecting on spawn failure or timeout. */
export function runJavaVersion(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(path, ['-version'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new Error(`java -version did not finish within ${PROBE_TIMEOUT_MS / 1000}s`))
    }, PROBE_TIMEOUT_MS)
    const collect = (chunk: Buffer): void => {
      output += chunk.toString('utf8')
    }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(output)
    })
  })
}

export async function validateJava(path: string): Promise<JavaValidation> {
  if (!(await exists(path))) return invalid(`No file at ${path}`)
  let output: string
  try {
    output = await runJavaVersion(path)
  } catch (err) {
    return invalid(err instanceof Error ? err.message : String(err))
  }
  const parsed = parseJavaVersion(output)
  if (!parsed) return invalid('Could not read a version from `java -version`; is this a Java executable?')
  return { valid: true, version: parsed.version, major: parsed.major, error: null }
}
