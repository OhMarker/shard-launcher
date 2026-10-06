import { describe, expect, it } from 'vitest'
import {
  decodeFrames,
  DiscordFrameError,
  DiscordOpcode,
  encodeFrame,
  FRAME_HEADER_BYTES,
  handshakePayload,
  ipcSocketPaths,
  MAX_FRAME_BYTES,
  setActivityPayload,
  toUnixSeconds,
  toWireActivity
} from '@main/discord/frames'

const defaults = { largeImageKey: 'shard_logo', largeImageText: 'Shard Launcher' }

describe('frame codec', () => {
  it('writes a little-endian opcode/length header followed by UTF-8 JSON', () => {
    const frame = encodeFrame(DiscordOpcode.Handshake, handshakePayload('123'))
    const json = Buffer.from('{"v":1,"client_id":"123"}')
    expect(frame.readUInt32LE(0)).toBe(0)
    expect(frame.readUInt32LE(4)).toBe(json.length)
    expect(frame.subarray(FRAME_HEADER_BYTES).equals(json)).toBe(true)
  })

  it('round-trips multiple frames and keeps the trailing partial frame as rest', () => {
    const a = encodeFrame(DiscordOpcode.Frame, { cmd: 'DISPATCH', evt: 'READY', data: { v: 1 } })
    const b = encodeFrame(DiscordOpcode.Ping, { nonce: 'x' })
    const c = encodeFrame(DiscordOpcode.Frame, { cmd: 'SET_ACTIVITY', data: { name: 'Shard' } })
    const stream = Buffer.concat([a, b, c])
    const cut = stream.length - 5

    const first = decodeFrames(stream.subarray(0, cut))
    expect(first.frames).toEqual([
      { opcode: DiscordOpcode.Frame, payload: { cmd: 'DISPATCH', evt: 'READY', data: { v: 1 } } },
      { opcode: DiscordOpcode.Ping, payload: { nonce: 'x' } }
    ])
    expect(first.rest.length).toBe(c.length - 5)

    const second = decodeFrames(Buffer.concat([first.rest, stream.subarray(cut)]))
    expect(second.frames).toEqual([{ opcode: DiscordOpcode.Frame, payload: { cmd: 'SET_ACTIVITY', data: { name: 'Shard' } } }])
    expect(second.rest.length).toBe(0)
  })

  it('waits for more bytes when even the header is incomplete', () => {
    const result = decodeFrames(Buffer.from([1, 0, 0]))
    expect(result.frames).toEqual([])
    expect(result.rest.length).toBe(3)
  })

  it('decodes an empty body as a null payload', () => {
    const header = Buffer.alloc(FRAME_HEADER_BYTES)
    header.writeUInt32LE(DiscordOpcode.Close, 0)
    header.writeUInt32LE(0, 4)
    expect(decodeFrames(header).frames).toEqual([{ opcode: DiscordOpcode.Close, payload: null }])
  })

  it('rejects oversized lengths and non-JSON bodies', () => {
    const huge = Buffer.alloc(FRAME_HEADER_BYTES)
    huge.writeUInt32LE(DiscordOpcode.Frame, 0)
    huge.writeUInt32LE(MAX_FRAME_BYTES + 1, 4)
    expect(() => decodeFrames(huge)).toThrow(DiscordFrameError)

    const body = Buffer.from('{not json')
    const bad = Buffer.alloc(FRAME_HEADER_BYTES + body.length)
    bad.writeUInt32LE(DiscordOpcode.Frame, 0)
    bad.writeUInt32LE(body.length, 4)
    body.copy(bad, FRAME_HEADER_BYTES)
    expect(() => decodeFrames(bad)).toThrow(DiscordFrameError)
  })
})

describe('ipcSocketPaths', () => {
  it('uses named pipes on Windows', () => {
    const paths = ipcSocketPaths('win32', {})
    expect(paths).toHaveLength(10)
    expect(paths[0]).toBe('\\\\?\\pipe\\discord-ipc-0')
    expect(paths[9]).toBe('\\\\?\\pipe\\discord-ipc-9')
  })

  it('prefers XDG_RUNTIME_DIR, then temp dirs, then /tmp on unix', () => {
    expect(ipcSocketPaths('linux', { XDG_RUNTIME_DIR: '/run/user/1000/', TMPDIR: '/t' })[0]).toBe('/run/user/1000/discord-ipc-0')
    expect(ipcSocketPaths('darwin', { TMPDIR: '/var/folders/x' })[0]).toBe('/var/folders/x/discord-ipc-0')
    expect(ipcSocketPaths('linux', {})[0]).toBe('/tmp/discord-ipc-0')
    const linux = ipcSocketPaths('linux', { XDG_RUNTIME_DIR: '/run/user/1000' })
    expect(linux).toContain('/run/user/1000/app/com.discordapp.Discord/discord-ipc-3')
    expect(linux).toContain('/run/user/1000/snap.discord/discord-ipc-9')
  })
})

describe('activity payloads', () => {
  it('maps the launcher activity onto the Rich Presence shape with defaults', () => {
    const wire = toWireActivity(
      { details: 'Playing Crystal PvP', state: 'In game', startTimestamp: 1_759_752_000_000 },
      defaults
    )
    expect(wire).toEqual({
      details: 'Playing Crystal PvP',
      state: 'In game',
      timestamps: { start: 1_759_752_000 },
      assets: { large_image: 'shard_logo', large_text: 'Shard Launcher' }
    })
  })

  it('keeps explicit assets, drops too-short text and truncates long text', () => {
    const wire = toWireActivity(
      { details: 'x', state: 'y'.repeat(200), largeImageKey: 'custom', largeImageText: 'Custom' },
      defaults
    )
    expect(wire.details).toBeUndefined()
    expect(wire.state).toHaveLength(128)
    expect(wire.timestamps).toBeUndefined()
    expect(wire.assets).toEqual({ large_image: 'custom', large_text: 'Custom' })
  })

  it('accepts timestamps already in seconds', () => {
    expect(toUnixSeconds(1_759_752_000)).toBe(1_759_752_000)
    expect(toUnixSeconds(1_759_752_000_999)).toBe(1_759_752_000)
  })

  it('builds SET_ACTIVITY frames and omits the activity key when clearing', () => {
    const set = setActivityPayload(4242, 'nonce-1', toWireActivity({ details: 'Idle', state: 'Menu' }, defaults))
    expect(set).toMatchObject({ cmd: 'SET_ACTIVITY', nonce: 'nonce-1', args: { pid: 4242 } })
    expect(set.args.activity?.details).toBe('Idle')

    const clear = setActivityPayload(4242, 'nonce-2', undefined)
    const decoded = decodeFrames(encodeFrame(DiscordOpcode.Frame, clear)).frames[0]?.payload
    expect(decoded).toEqual({ cmd: 'SET_ACTIVITY', args: { pid: 4242 }, nonce: 'nonce-2' })
  })
})
