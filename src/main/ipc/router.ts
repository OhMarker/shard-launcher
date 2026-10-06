import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  ipcInputSchemas,
  type IpcChannel,
  type IpcEventName,
  type IpcEvents,
  type IpcInput,
  type IpcOutput,
  type IpcResponse
} from '@shared/ipc'
import { ShardError } from '@shared/errors'
import { createLogger } from '../logger'

const log = createLogger('ipc')

export type IpcHandler<K extends IpcChannel> = (
  input: IpcInput<K>,
  event: IpcMainInvokeEvent
) => Promise<IpcOutput<K>> | IpcOutput<K>

const registered = new Set<string>()

/**
 * Registers a typed handler. Input is validated against the shared schema a second time
 * here (the preload already did) so a compromised renderer cannot bypass validation.
 * Errors are serialized into a stable envelope instead of leaking stack traces.
 */
export function handle<K extends IpcChannel>(channel: K, handler: IpcHandler<K>): void {
  if (registered.has(channel)) {
    throw new Error(`IPC handler already registered for ${channel}`)
  }
  registered.add(channel)
  ipcMain.handle(channel, async (event, rawInput: unknown): Promise<IpcResponse<unknown>> => {
    const schema = ipcInputSchemas[channel]
    const parsed = schema.safeParse(rawInput)
    if (!parsed.success) {
      log.warn(`Rejected invalid input on ${channel}`, parsed.error.issues.slice(0, 3))
      return {
        ok: false,
        error: {
          code: 'INVALID_INPUT',
          message: `Invalid input for ${channel}`,
          details: parsed.error.issues,
          recoverable: true
        }
      }
    }
    try {
      const value = await handler(parsed.data as IpcInput<K>, event)
      return { ok: true, value }
    } catch (err) {
      const shardErr = ShardError.from(err)
      if (shardErr.code === 'CANCELLED' || shardErr.code === 'AUTH_CANCELLED') {
        log.info(`${channel}: ${shardErr.message}`)
      } else {
        log.error(`${channel} failed: [${shardErr.code}] ${shardErr.message}`, shardErr.cause ?? '')
      }
      return {
        ok: false,
        error: {
          code: shardErr.code,
          message: shardErr.message,
          details: shardErr.details,
          recoverable: shardErr.recoverable
        }
      }
    }
  })
}

export function unregisterAll(): void {
  for (const channel of registered) ipcMain.removeHandler(channel)
  registered.clear()
}

/** Pushes an event to every open renderer. */
export function emit<E extends IpcEventName>(event: E, payload: IpcEvents[E]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(event, payload)
    }
  }
}

export function registeredChannels(): string[] {
  return [...registered]
}
