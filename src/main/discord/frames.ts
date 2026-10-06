/**
 * Wire format of Discord's local IPC (the transport behind Rich Presence):
 * every frame is `[opcode u32 LE][length u32 LE][length bytes of JSON]`. This module is pure so
 * the codec and payload builders can be unit-tested; `rpc.ts` owns the socket.
 */
import type { DiscordActivity } from '../context'

export const DiscordOpcode = {
  Handshake: 0,
  Frame: 1,
  Close: 2,
  Ping: 3,
  Pong: 4
} as const
export type DiscordOpcode = (typeof DiscordOpcode)[keyof typeof DiscordOpcode]

export const FRAME_HEADER_BYTES = 8
/** Discord payloads are a few hundred bytes; anything near this is a desynchronised stream. */
export const MAX_FRAME_BYTES = 1024 * 1024
/** Discord rejects `details`/`state` shorter than 2 or longer than 128 characters. */
const ACTIVITY_TEXT_MIN = 2
const ACTIVITY_TEXT_MAX = 128
/** Discord listens on ten sockets (one per running client / instance). */
const SOCKET_COUNT = 10

export class DiscordFrameError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiscordFrameError'
  }
}

export interface DiscordFrame {
  opcode: number
  payload: unknown
}

export function encodeFrame(opcode: number, payload: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(payload), 'utf8')
  const frame = Buffer.allocUnsafe(FRAME_HEADER_BYTES + json.length)
  frame.writeUInt32LE(opcode, 0)
  frame.writeUInt32LE(json.length, 4)
  json.copy(frame, FRAME_HEADER_BYTES)
  return frame
}

/**
 * Decodes every complete frame at the start of `buffer`. `rest` holds the trailing partial
 * frame (if any) and must be prepended to the next chunk. Throws DiscordFrameError when the
 * stream is corrupt (oversized length or non-JSON body).
 */
export function decodeFrames(buffer: Buffer): { frames: DiscordFrame[]; rest: Buffer } {
  const frames: DiscordFrame[] = []
  let offset = 0
  while (buffer.length - offset >= FRAME_HEADER_BYTES) {
    const opcode = buffer.readUInt32LE(offset)
    const length = buffer.readUInt32LE(offset + 4)
    if (length > MAX_FRAME_BYTES) {
      throw new DiscordFrameError(`Frame of ${length} bytes exceeds the ${MAX_FRAME_BYTES} byte limit`)
    }
    const bodyStart = offset + FRAME_HEADER_BYTES
    if (buffer.length - bodyStart < length) break
    const body = buffer.toString('utf8', bodyStart, bodyStart + length)
    let payload: unknown = null
    if (length > 0) {
      try {
        payload = JSON.parse(body)
      } catch {
        throw new DiscordFrameError(`Frame with opcode ${opcode} does not contain valid JSON`)
      }
    }
    frames.push({ opcode, payload })
    offset = bodyStart + length
  }
  return { frames, rest: buffer.subarray(offset) }
}

/** Candidate socket paths in the order Discord clients claim them. */
export function ipcSocketPaths(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  const indices = Array.from({ length: SOCKET_COUNT }, (_, index) => index)
  if (platform === 'win32') return indices.map((index) => `\\\\?\\pipe\\discord-ipc-${index}`)
  const base = (env.XDG_RUNTIME_DIR ?? env.TMPDIR ?? env.TMP ?? env.TEMP ?? '/tmp').replace(/\/+$/, '')
  // Sandboxed Linux builds expose the socket inside their own runtime folder.
  const roots = [base, `${base}/app/com.discordapp.Discord`, `${base}/snap.discord`]
  return roots.flatMap((root) => indices.map((index) => `${root}/discord-ipc-${index}`))
}

export function handshakePayload(clientId: string): { v: 1; client_id: string } {
  return { v: 1, client_id: clientId }
}

export interface WireActivity {
  details?: string
  state?: string
  timestamps?: { start: number }
  assets: { large_image: string; large_text: string }
}

export interface ActivityDefaults {
  largeImageKey: string
  largeImageText: string
}

function clampText(text: string): string | undefined {
  const trimmed = text.trim()
  if (trimmed.length < ACTIVITY_TEXT_MIN) return undefined
  return trimmed.length > ACTIVITY_TEXT_MAX ? trimmed.slice(0, ACTIVITY_TEXT_MAX) : trimmed
}

/** Discord expects Unix seconds; `Date.now()` style millisecond values are converted. */
export function toUnixSeconds(timestamp: number): number {
  return Math.floor(timestamp > 1e11 ? timestamp / 1000 : timestamp)
}

export function toWireActivity(activity: DiscordActivity, defaults: ActivityDefaults): WireActivity {
  const wire: WireActivity = {
    assets: {
      large_image: activity.largeImageKey ?? defaults.largeImageKey,
      large_text: activity.largeImageText ?? defaults.largeImageText
    }
  }
  const details = clampText(activity.details)
  const state = clampText(activity.state)
  if (details !== undefined) wire.details = details
  if (state !== undefined) wire.state = state
  if (activity.startTimestamp !== undefined) wire.timestamps = { start: toUnixSeconds(activity.startTimestamp) }
  return wire
}

export interface SetActivityPayload {
  cmd: 'SET_ACTIVITY'
  args: { pid: number; activity: WireActivity | undefined }
  nonce: string
}

/** `activity: undefined` clears the presence (the key is dropped by JSON.stringify). */
export function setActivityPayload(pid: number, nonce: string, activity: WireActivity | undefined): SetActivityPayload {
  return { cmd: 'SET_ACTIVITY', args: { pid, activity }, nonce }
}
