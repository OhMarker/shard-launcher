import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC_EVENTS,
  ipcInputSchemas,
  type IpcChannel,
  type IpcEventName,
  type IpcResponse,
  type ShardApi
} from '@shared/ipc'
import { type SerializedError, type ShardErrorCode } from '@shared/errors'

const channels = new Set<string>(Object.keys(ipcInputSchemas))
const events = new Set<string>(IPC_EVENTS)

function serialized(code: SerializedError['code'], message: string, details?: unknown): SerializedError {
  return { __shardError: true, code, message, details, recoverable: true }
}

/**
 * The only bridge the renderer gets. Channel names are allow-listed and every
 * input is validated with the shared Zod schema before it leaves the renderer
 * context. Errors cross the bridge as plain serializable objects; the renderer
 * turns them back into ShardError instances.
 */
const api: ShardApi = {
  async invoke(channel: IpcChannel, ...args: unknown[]) {
    if (!channels.has(channel)) {
      throw serialized('INVALID_INPUT', `Unknown IPC channel: ${String(channel)}`)
    }
    const schema = ipcInputSchemas[channel]
    const parsed = schema.safeParse(args[0])
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ')
      throw serialized('INVALID_INPUT', `Invalid input for ${channel}: ${issues}`, parsed.error.issues)
    }
    const response = (await ipcRenderer.invoke(channel, parsed.data)) as IpcResponse<unknown>
    if (response && response.ok) return response.value as never
    const err = response?.error ?? { code: 'UNKNOWN', message: 'Empty IPC response', recoverable: true }
    throw {
      __shardError: true,
      code: err.code as ShardErrorCode,
      message: err.message,
      details: err.details,
      recoverable: err.recoverable
    } satisfies SerializedError
  },
  on(event: IpcEventName, listener: (payload: never) => void) {
    if (!events.has(event)) {
      throw serialized('INVALID_INPUT', `Unknown IPC event: ${String(event)}`)
    }
    const wrapped = (_e: IpcRendererEvent, payload: unknown): void => {
      listener(payload as never)
    }
    ipcRenderer.on(event, wrapped)
    return () => {
      ipcRenderer.removeListener(event, wrapped)
    }
  },
  platform: process.platform as ShardApi['platform'],
  versions: {
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? ''
  }
}

contextBridge.exposeInMainWorld('shard', api)
