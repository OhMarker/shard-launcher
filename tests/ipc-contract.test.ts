import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS, IPC_EVENTS, ipcInputSchemas } from '@shared/ipc'
import { ShardError, isSerializedError } from '@shared/errors'
import { SettingsSchema, DEFAULT_SETTINGS } from '@shared/schemas/storage'

describe('IPC contract', () => {
  it('every channel name is namespaced as domain:action', () => {
    for (const channel of IPC_CHANNELS) expect(channel).toMatch(/^[a-z]+:[a-zA-Z]+$/)
  })

  it('channels and events do not overlap', () => {
    const events = new Set<string>(IPC_EVENTS)
    for (const channel of IPC_CHANNELS) expect(events.has(channel)).toBe(false)
  })

  it('void channels reject stray payloads and object channels reject garbage', () => {
    expect(ipcInputSchemas['app:info'].safeParse(undefined).success).toBe(true)
    expect(ipcInputSchemas['app:info'].safeParse({ x: 1 }).success).toBe(false)
    expect(ipcInputSchemas['auth:login'].safeParse({ method: 'browser' }).success).toBe(true)
    expect(ipcInputSchemas['auth:login'].safeParse({ method: 'password' }).success).toBe(false)
    expect(ipcInputSchemas['app:openExternal'].safeParse({ url: 'javascript:alert(1)' }).success).toBe(false)
    expect(ipcInputSchemas['app:openExternal'].safeParse({ url: 'https://modrinth.com' }).success).toBe(true)
  })

  it('applies defaults for search parameters', () => {
    const parsed = ipcInputSchemas['modrinth:search'].parse({ gameVersion: '1.21.4' })
    expect(parsed).toMatchObject({ query: '', index: 'relevance', offset: 0, limit: 20 })
  })
})

describe('ShardError serialization', () => {
  it('round-trips through the wire format', () => {
    const original = new ShardError('AUTH_NO_GAME', 'No Java Edition', { details: { items: [] } })
    const wire = JSON.parse(JSON.stringify(original)) as unknown
    expect(isSerializedError(wire)).toBe(true)
    const restored = ShardError.from(wire)
    expect(restored.code).toBe('AUTH_NO_GAME')
    expect(restored.message).toBe('No Java Edition')
    expect(restored.details).toEqual({ items: [] })
  })

  it('maps Node error codes', () => {
    const enoent = Object.assign(new Error('missing'), { code: 'ENOENT' })
    expect(ShardError.from(enoent).code).toBe('NOT_FOUND')
    const dns = Object.assign(new Error('dns'), { code: 'ENOTFOUND' })
    expect(ShardError.from(dns).code).toBe('OFFLINE')
    expect(ShardError.from('boom').code).toBe('UNKNOWN')
  })
})

describe('Settings schema', () => {
  it('fills defaults and repairs bad values', () => {
    expect(SettingsSchema.parse({})).toEqual(DEFAULT_SETTINGS)
    expect(SettingsSchema.safeParse({ accent: 'red' }).success).toBe(false)
    expect(SettingsSchema.safeParse({ downloadConcurrency: 1000 }).success).toBe(false)
    const parsed = SettingsSchema.parse({ accent: '#A78BFA', java: { memoryMb: 8192 } })
    expect(parsed.accent).toBe('#A78BFA')
    expect(parsed.java).toEqual({ memoryMb: 8192, jvmArgs: [] })
  })
})
