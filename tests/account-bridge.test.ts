import { describe, expect, it, vi } from 'vitest'
import { ShardError } from '@shared/errors'
import {
  accountsBody,
  checkRequest,
  generateBridgeSecret,
  handleBridgeRequest,
  routeRequest,
  SIGN_IN_AGAIN,
  sessionError,
  UNKNOWN_ACCOUNT,
  type BridgeDeps,
  type BridgeRequest
} from '@main/launch/account-bridge-logic'

const SECRET = 'ab'.repeat(32)
const A = '4a5e875e479a43f1bfc16c6bd326643d'
const B = '069a79f444e94726a5befca90e38aaf5'

function deps(overrides: Partial<BridgeDeps> = {}): BridgeDeps {
  return {
    listAccounts: () => [
      { id: A, username: 'OhMarkerr', isActive: true, needsReauth: false },
      { id: B, username: 'Steve', isActive: false, needsReauth: false }
    ],
    getSession: vi.fn(async (id: string) => ({
      username: id === A ? 'OhMarkerr' : 'Steve',
      uuid: id,
      accessToken: `mc-token-${id}`,
      xuid: '2535400000000000'
    })),
    setActive: vi.fn(),
    requestAdd: vi.fn(),
    clientId: 'c2hhcmQtbGF1bmNoZXI=',
    ...overrides
  }
}

function req(method: string, url: string, headers: BridgeRequest['headers'] = {}): BridgeRequest {
  return { method, url, headers: { authorization: `Bearer ${SECRET}`, ...headers } }
}

describe('generateBridgeSecret', () => {
  it('is 32 random bytes as hex, different every time', () => {
    const a = generateBridgeSecret()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(generateBridgeSecret()).not.toBe(a)
  })
})

describe('checkRequest', () => {
  it('accepts the right bearer secret', () => {
    expect(checkRequest({ authorization: `Bearer ${SECRET}` }, SECRET)).toBeNull()
  })

  it('rejects a missing, malformed or wrong secret with 401', () => {
    expect(checkRequest({}, SECRET)?.status).toBe(401)
    expect(checkRequest({ authorization: SECRET }, SECRET)?.status).toBe(401)
    expect(checkRequest({ authorization: `Basic ${SECRET}` }, SECRET)?.status).toBe(401)
    expect(checkRequest({ authorization: `Bearer ${'cd'.repeat(32)}` }, SECRET)?.status).toBe(401)
    expect(checkRequest({ authorization: `Bearer ${SECRET}x` }, SECRET)?.status).toBe(401)
    expect(checkRequest({ authorization: 'Bearer ' }, SECRET)?.status).toBe(401)
  })

  it('rejects any request with an Origin header with 403, even with the right secret', () => {
    expect(checkRequest({ authorization: `Bearer ${SECRET}`, origin: 'https://evil.example' }, SECRET)?.status).toBe(403)
    expect(checkRequest({ authorization: `Bearer ${SECRET}`, origin: 'null' }, SECRET)?.status).toBe(403)
    expect(checkRequest({ origin: '' }, SECRET)?.status).toBe(403)
  })
})

describe('routeRequest', () => {
  it('routes the three endpoints', () => {
    expect(routeRequest('GET', '/v1/accounts')).toEqual({ kind: 'list' })
    expect(routeRequest('GET', '/v1/accounts?t=1')).toEqual({ kind: 'list' })
    expect(routeRequest('POST', '/v1/accounts/add')).toEqual({ kind: 'add' })
    expect(routeRequest('POST', `/v1/accounts/${A}/session`)).toEqual({ kind: 'session', accountId: A })
  })

  it('answers 405 for the wrong method and 404 for unknown paths', () => {
    expect(routeRequest('POST', '/v1/accounts')).toMatchObject({ status: 405 })
    expect(routeRequest('GET', '/v1/accounts/add')).toMatchObject({ status: 405 })
    expect(routeRequest('GET', `/v1/accounts/${A}/session`)).toMatchObject({ status: 405 })
    expect(routeRequest('GET', '/')).toMatchObject({ status: 404 })
    expect(routeRequest('GET', '/v1/accounts/')).toMatchObject({ status: 404 })
    expect(routeRequest('POST', `/v1/accounts/${A}/session/extra`)).toMatchObject({ status: 404 })
  })

  it('treats odd account ids as unknown accounts', () => {
    expect(routeRequest('POST', '/v1/accounts/%E0%A4%A/session')).toEqual({ status: 404, body: { error: UNKNOWN_ACCOUNT } })
    expect(routeRequest('POST', '/v1/accounts/..%2F..%2Fx/session')).toEqual({ status: 404, body: { error: UNKNOWN_ACCOUNT } })
  })
})

describe('accountsBody', () => {
  it('lists id, name and uuid and names the active account', () => {
    expect(accountsBody(deps().listAccounts())).toEqual({
      active: A,
      accounts: [
        { id: A, name: 'OhMarkerr', uuid: A },
        { id: B, name: 'Steve', uuid: B }
      ]
    })
  })

  it('has a null active id when nobody is selected', () => {
    expect(accountsBody([{ id: B, username: 'Steve', isActive: false, needsReauth: false }]).active).toBeNull()
  })
})

describe('sessionError', () => {
  it('maps unknown accounts, refresh failures and other errors', () => {
    expect(sessionError(new ShardError('NOT_FOUND', 'x'))).toEqual({ status: 404, body: { error: UNKNOWN_ACCOUNT } })
    expect(sessionError(new ShardError('AUTH_REFRESH_FAILED', 'x'))).toEqual({ status: 409, body: { error: SIGN_IN_AGAIN } })
    expect(sessionError(new ShardError('AUTH_NO_GAME', 'x')).status).toBe(409)
    expect(sessionError(new ShardError('OFFLINE', 'You are offline'))).toEqual({ status: 500, body: { error: 'You are offline' } })
  })
})

describe('handleBridgeRequest', () => {
  it('checks auth before anything else', async () => {
    const d = deps()
    expect((await handleBridgeRequest({ method: 'POST', url: '/v1/accounts/add', headers: {} }, SECRET, d)).status).toBe(401)
    expect((await handleBridgeRequest(req('POST', '/v1/accounts/add', { origin: 'https://x' }), SECRET, d)).status).toBe(403)
    expect(d.requestAdd).not.toHaveBeenCalled()
  })

  it('GET /v1/accounts returns the accounts', async () => {
    const res = await handleBridgeRequest(req('GET', '/v1/accounts'), SECRET, deps())
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ active: A })
  })

  it('POST session refreshes, selects the account and returns the session', async () => {
    const d = deps()
    const res = await handleBridgeRequest(req('POST', `/v1/accounts/${B}/session`), SECRET, d)
    expect(res).toEqual({
      status: 200,
      body: { name: 'Steve', uuid: B, accessToken: `mc-token-${B}`, xuid: '2535400000000000', clientId: 'c2hhcmQtbGF1bmNoZXI=' }
    })
    expect(d.getSession).toHaveBeenCalledWith(B)
    expect(d.setActive).toHaveBeenCalledWith(B)
  })

  it('omits an empty xuid', async () => {
    const d = deps({ getSession: async () => ({ username: 'Steve', uuid: B, accessToken: 't', xuid: '' }) })
    const res = await handleBridgeRequest(req('POST', `/v1/accounts/${B}/session`), SECRET, d)
    expect(res.body).not.toHaveProperty('xuid')
  })

  it('POST session for an unknown account is 404 and touches nothing', async () => {
    const d = deps()
    const res = await handleBridgeRequest(req('POST', `/v1/accounts/${'f'.repeat(32)}/session`), SECRET, d)
    expect(res).toEqual({ status: 404, body: { error: UNKNOWN_ACCOUNT } })
    expect(d.getSession).not.toHaveBeenCalled()
    expect(d.setActive).not.toHaveBeenCalled()
  })

  it('POST session is 409 when the account needs a new sign-in or the refresh fails', async () => {
    const flagged = deps({ listAccounts: () => [{ id: B, username: 'Steve', isActive: false, needsReauth: true }] })
    expect(await handleBridgeRequest(req('POST', `/v1/accounts/${B}/session`), SECRET, flagged)).toEqual({
      status: 409,
      body: { error: SIGN_IN_AGAIN }
    })
    expect(flagged.getSession).not.toHaveBeenCalled()

    const failing = deps({
      getSession: async () => {
        throw new ShardError('AUTH_REFRESH_FAILED', 'expired')
      }
    })
    const res = await handleBridgeRequest(req('POST', `/v1/accounts/${B}/session`), SECRET, failing)
    expect(res.status).toBe(409)
    expect(failing.setActive).not.toHaveBeenCalled()
  })

  it('POST add asks the launcher to sign in and answers 202 right away', async () => {
    const d = deps()
    expect(await handleBridgeRequest(req('POST', '/v1/accounts/add'), SECRET, d)).toEqual({ status: 202, body: {} })
    expect(d.requestAdd).toHaveBeenCalledOnce()
  })
})
