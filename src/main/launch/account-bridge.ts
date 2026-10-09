/**
 * Loopback HTTP server that lets a running Shard client switch accounts without signing in to
 * Microsoft itself. One server per launched Shard instance: bound to 127.0.0.1 on a random port,
 * guarded by a per-launch secret, closed when that game process exits. Rules and response shapes
 * are in account-bridge-logic.ts. Never log request headers, bodies or responses: they carry the
 * secret and Minecraft access tokens.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { type AddressInfo } from 'node:net'
import { app } from 'electron'
import { type AccountBridgeInfo } from '@shared/types'
import { type AccountService, type AppContext } from '../context'
import { createLogger } from '../logger'
import { CLIENT_ID } from '../minecraft/arguments'
import { generateBridgeSecret, handleBridgeRequest, type BridgeDeps, type BridgeResponse } from './account-bridge-logic'

const log = createLogger('account-bridge')

export interface AccountBridge {
  info: AccountBridgeInfo
  close(): Promise<void>
}

/** Shows, restores and focuses the launcher window, then asks the renderer to open sign-in. */
function requestAdd(ctx: AppContext): void {
  try {
    const win = ctx.getWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      // Windows refuses focus stealing from background apps; a brief always-on-top raises it anyway.
      win.setAlwaysOnTop(true)
      win.setAlwaysOnTop(false)
      if (process.platform === 'darwin') app.focus({ steal: true })
    }
    ctx.emit('auth:signInRequested', {})
  } catch (err) {
    log.warn('Could not bring the launcher to the front for sign-in', err)
  }
}

function deps(ctx: AppContext): BridgeDeps {
  const accounts = (): AccountService => ctx.services.accounts
  return {
    listAccounts: () => accounts().list(),
    getSession: (id) => accounts().getSession(id),
    setActive: (id) => {
      if (accounts().getActive()?.id !== id) accounts().setActive(id)
    },
    requestAdd: () => requestAdd(ctx),
    clientId: CLIENT_ID
  }
}

function send(res: ServerResponse, response: BridgeResponse): void {
  const body = JSON.stringify(response.body)
  res.writeHead(response.status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  })
  res.end(body)
}

export async function startAccountBridge(ctx: AppContext): Promise<AccountBridge> {
  const secret = generateBridgeSecret()
  const bridgeDeps = deps(ctx)

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // Every endpoint takes an empty body; discard whatever arrives.
    req.resume()
    handleBridgeRequest({ method: req.method ?? 'GET', url: req.url ?? '/', headers: req.headers }, secret, bridgeDeps)
      .then((response) => send(res, response))
      .catch(() => {
        log.warn(`Account bridge request ${req.method ?? '?'} ${(req.url ?? '').split('?')[0]} failed`)
        send(res, { status: 500, body: { error: 'internal error' } })
      })
  })
  server.headersTimeout = 10_000
  server.requestTimeout = 30_000

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  server.on('error', (err) => log.warn('Account bridge server error', err))

  const { port } = server.address() as AddressInfo
  log.info(`Account bridge listening on 127.0.0.1:${port}`)

  let closed: Promise<void> | null = null
  return {
    info: { url: `http://127.0.0.1:${port}`, secret },
    close() {
      closed ??= new Promise<void>((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections()
        log.info(`Account bridge on port ${port} closed`)
      })
      return closed
    }
  }
}
