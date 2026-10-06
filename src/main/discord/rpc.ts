import { randomUUID } from 'node:crypto'
import { createConnection, type Socket } from 'node:net'
import { APP_NAME } from '@shared/constants'
import { DiscordIpcMessageSchema } from '@shared/schemas/discord'
import { type AppContext, type DiscordActivity, type DiscordService } from '../context'
import { createLogger } from '../logger'
import {
  decodeFrames,
  DiscordOpcode,
  encodeFrame,
  handshakePayload,
  ipcSocketPaths,
  setActivityPayload,
  toWireActivity,
  type SetActivityPayload
} from './frames'

const log = createLogger('discord')

/**
 * Discord application id used for the Rich Presence handshake. The real id is created in the
 * Discord Developer Portal (https://discord.com/developers/applications -> New Application);
 * its "Application ID" replaces this placeholder and the Rich Presence art assets referenced by
 * `DISCORD_LARGE_IMAGE_KEY` are uploaded under that application. Until then Discord accepts the
 * connection but shows no presence.
 */
export const SHARD_DISCORD_CLIENT_ID = '1300000000000000000'
export const DISCORD_LARGE_IMAGE_KEY = 'shard_logo'

const CONNECT_TIMEOUT_MS = 3_000
const BASE_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 60_000
/** 2^6 seconds already exceeds the cap, so the exponent stops growing here. */
const MAX_BACKOFF_EXPONENT = 6

/**
 * Minimal Discord IPC client. Connects to the first responsive `discord-ipc-N` socket, performs
 * the handshake, waits for READY and then sends SET_ACTIVITY frames. Failures never reach the
 * caller: the launcher must work identically without Discord.
 */
class DiscordRpcClient implements DiscordService {
  private enabled = false
  private disposed = false
  private socket: Socket | null = null
  private ready = false
  private connecting = false
  private wasReachable = false
  private backoffExponent = 0
  private reconnectTimer: NodeJS.Timeout | null = null
  private pending: DiscordActivity | null = null
  private buffer: Buffer = Buffer.alloc(0)

  constructor(private readonly clientId: string) {}

  setEnabled(enabled: boolean): void {
    if (this.disposed || this.enabled === enabled) return
    this.enabled = enabled
    if (enabled) {
      log.debug('Rich Presence enabled')
      this.connect()
      return
    }
    log.debug('Rich Presence disabled')
    this.pending = null
    this.sendClear()
    this.disconnect()
  }

  setActivity(activity: DiscordActivity): void {
    if (this.disposed) return
    this.pending = activity
    if (!this.enabled) return
    if (this.ready) this.flush()
    else this.connect()
  }

  clear(): void {
    this.pending = null
    this.sendClear()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.enabled = false
    this.pending = null
    this.sendClear()
    this.disconnect()
  }

  private connect(): void {
    if (!this.enabled || this.disposed || this.connecting || this.socket) return
    this.connecting = true
    this.tryPath(ipcSocketPaths(process.platform, process.env), 0)
  }

  private tryPath(paths: readonly string[], index: number): void {
    if (!this.enabled || this.disposed) {
      this.connecting = false
      return
    }
    const path = paths[index]
    if (path === undefined) {
      this.connecting = false
      log.debug('Discord is not running (no IPC socket answered)')
      this.scheduleReconnect()
      return
    }
    const socket = createConnection(path)
    socket.setTimeout(CONNECT_TIMEOUT_MS)
    const fail = (): void => {
      socket.destroy()
      this.tryPath(paths, index + 1)
    }
    socket.once('error', fail)
    socket.once('timeout', fail)
    socket.once('connect', () => {
      socket.off('error', fail)
      socket.off('timeout', fail)
      socket.setTimeout(0)
      this.connecting = false
      if (!this.enabled || this.disposed) {
        socket.destroy()
        return
      }
      this.attach(socket, path)
    })
  }

  private attach(socket: Socket, path: string): void {
    this.socket = socket
    this.buffer = Buffer.alloc(0)
    socket.on('data', (chunk: Buffer) => this.onData(socket, chunk))
    socket.on('error', (err) => log.debug(`Discord socket error: ${err.message}`))
    socket.on('close', () => this.onClose(socket))
    log.debug(`Connected to Discord at ${path}; sending handshake`)
    this.write(socket, DiscordOpcode.Handshake, handshakePayload(this.clientId))
  }

  private onData(socket: Socket, chunk: Buffer): void {
    if (this.socket !== socket) return
    this.buffer = Buffer.concat([this.buffer, chunk])
    let decoded: ReturnType<typeof decodeFrames>
    try {
      decoded = decodeFrames(this.buffer)
    } catch (err) {
      log.debug(`Dropping Discord connection: ${err instanceof Error ? err.message : String(err)}`)
      socket.destroy()
      return
    }
    this.buffer = decoded.rest
    for (const frame of decoded.frames) this.onFrame(socket, frame.opcode, frame.payload)
  }

  private onFrame(socket: Socket, opcode: number, payload: unknown): void {
    switch (opcode) {
      case DiscordOpcode.Ping:
        this.write(socket, DiscordOpcode.Pong, payload)
        return
      case DiscordOpcode.Close:
        log.debug(`Discord closed the connection: ${JSON.stringify(payload)}`)
        socket.destroy()
        return
      case DiscordOpcode.Frame:
        break
      default:
        return
    }
    const parsed = DiscordIpcMessageSchema.safeParse(payload)
    if (!parsed.success) {
      log.debug('Ignoring malformed Discord message')
      return
    }
    const message = parsed.data
    if (message.evt === 'READY') {
      this.ready = true
      this.wasReachable = true
      this.backoffExponent = 0
      log.debug('Discord Rich Presence ready')
      this.flush()
      return
    }
    if (message.evt === 'ERROR') {
      log.debug(`Discord rejected a command: ${JSON.stringify(message.data)}`)
    }
  }

  private onClose(socket: Socket): void {
    if (this.socket !== socket) return
    this.socket = null
    this.ready = false
    this.buffer = Buffer.alloc(0)
    log.debug('Discord connection closed')
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.disposed || !this.enabled || this.reconnectTimer) return
    if (!this.wasReachable && this.pending === null) {
      log.debug('Not retrying Discord until an activity is set')
      return
    }
    const delay =
      Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** this.backoffExponent) + Math.floor(Math.random() * 250)
    this.backoffExponent = Math.min(this.backoffExponent + 1, MAX_BACKOFF_EXPONENT)
    log.debug(`Retrying Discord in ${delay}ms`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
    this.reconnectTimer.unref()
  }

  private flush(): void {
    if (!this.socket || !this.ready || !this.pending) return
    const activity = toWireActivity(this.pending, { largeImageKey: DISCORD_LARGE_IMAGE_KEY, largeImageText: APP_NAME })
    this.send(setActivityPayload(process.pid, randomUUID(), activity))
  }

  private sendClear(): void {
    if (!this.socket || !this.ready) return
    this.send(setActivityPayload(process.pid, randomUUID(), undefined))
  }

  private send(payload: SetActivityPayload): void {
    if (this.socket) this.write(this.socket, DiscordOpcode.Frame, payload)
  }

  private write(socket: Socket, opcode: number, payload: unknown): void {
    try {
      socket.write(encodeFrame(opcode, payload))
    } catch (err) {
      log.debug(`Could not write to Discord: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    const socket = this.socket
    this.socket = null
    this.ready = false
    this.connecting = false
    if (socket) {
      // end() lets a queued clear frame flush before the FIN; unref() keeps it from holding the process open.
      socket.end()
      socket.unref()
    }
  }
}

export function createDiscordService(ctx: AppContext): DiscordService {
  const client = new DiscordRpcClient(SHARD_DISCORD_CLIENT_ID)
  ctx.settings.onChange((next, previous) => {
    if (next.discordRpc !== previous.discordRpc) client.setEnabled(next.discordRpc)
  })
  return client
}
