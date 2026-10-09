import { describe, expect, it } from 'vitest'
import { LauncherInfoSchema } from '@shared/schemas/shard'
import { DEFAULT_INSTANCE_SETTINGS } from '@shared/schemas/storage'
import { type Instance, type ShardBuild, type ShardManifest } from '@shared/types'
import {
  buildLauncherInfo,
  selectBuild,
  SHARD_JAR_PATTERN,
  shardJarName,
  staleShardJars
} from '@main/shard/client-logic'

function build(version: string, minecraft: string[]): ShardBuild {
  return {
    version,
    minecraft,
    fabricLoader: '>=0.16',
    url: `https://example.invalid/shard-${version}.jar`,
    sha512: 'a'.repeat(128),
    changelog: '',
    releasedAt: '2026-10-01T00:00:00Z'
  }
}

const manifest: ShardManifest = {
  latest: '1.1.0-rc.1',
  builds: [
    build('0.9.0', ['1.21.1']),
    build('1.0.0-beta.2', ['1.21.4']),
    build('1.0.0', ['1.21.4', '1.21.5']),
    build('1.1.0-rc.1', ['1.21.5', '1.21.6'])
  ]
}

const instance: Instance = {
  id: 'inst-crystal',
  name: 'Crystal PvP',
  type: 'shard',
  minecraftVersion: '1.21.4',
  fabricLoader: '0.16.9',
  shardBuild: '1.0.0',
  createdAt: '2026-10-01T00:00:00Z',
  lastPlayedAt: null,
  playtimeMs: 0,
  icon: null,
  installState: 'installed',
  settings: DEFAULT_INSTANCE_SETTINGS
}

describe('selectBuild', () => {
  it('returns null without a manifest', () => {
    expect(selectBuild(null, '1.21.4')).toBeNull()
  })

  it('prefers the release over its own prerelease', () => {
    expect(selectBuild(manifest, '1.21.4')?.version).toBe('1.0.0')
  })

  it('ranks a newer prerelease above an older release', () => {
    expect(selectBuild(manifest, '1.21.5')?.version).toBe('1.1.0-rc.1')
    expect(selectBuild(manifest, '1.21.6')?.version).toBe('1.1.0-rc.1')
  })

  it('reports client-pending versions as null', () => {
    expect(selectBuild(manifest, '1.22')).toBeNull()
    expect(selectBuild({ latest: '', builds: [] }, '1.21.4')).toBeNull()
  })
})

describe('jar housekeeping', () => {
  it('names the jar after the build and keeps the name file-system safe', () => {
    expect(shardJarName('1.0.0')).toBe('shard-1.0.0.jar')
    expect(shardJarName('1.0.0-beta.2+build.7')).toBe('shard-1.0.0-beta.2+build.7.jar')
    expect(shardJarName('../evil')).toBe('shard-..-evil.jar')
    expect(SHARD_JAR_PATTERN.test(shardJarName('1.0.0'))).toBe(true)
  })

  it('removes every other shard jar, enabled or disabled, in any case', () => {
    const files = ['shard-1.0.0.jar', 'shard-0.9.0.jar', 'Shard-0.8.0.jar.disabled', 'sodium-0.6.jar', 'shard.jar']
    expect(staleShardJars(files, 'shard-1.0.0.jar')).toEqual(['shard-0.9.0.jar', 'Shard-0.8.0.jar.disabled'])
  })

  it('treats every shard jar as stale when no build applies', () => {
    const files = ['shard-1.0.0.jar', 'shard-0.9.0.jar.disabled', 'lithium.jar']
    expect(staleShardJars(files, null)).toEqual(['shard-1.0.0.jar', 'shard-0.9.0.jar.disabled'])
  })
})

describe('buildLauncherInfo', () => {
  const base = {
    launcherVersion: '0.1.0',
    instance,
    session: { accountId: '069a79f444e94726a5befca90e38aaf5', username: 'Steve' },
    settings: { accent: '#22D3EE', theme: 'dark' as const, sharedConfig: true },
    equippedPath: 'C:\\Shard\\cosmetics\\equipped.json',
    sharedConfigDir: 'C:\\Shard\\shared-config',
    now: new Date('2026-10-06T12:00:00Z')
  }

  it('produces a payload that validates against the contract schema', () => {
    const info = buildLauncherInfo(base)
    expect(LauncherInfoSchema.safeParse(info).success).toBe(true)
    expect(info).toMatchObject({
      schemaVersion: 1,
      launcherVersion: '0.1.0',
      accountId: base.session.accountId,
      username: 'Steve',
      minecraftVersion: '1.21.4',
      instanceId: 'inst-crystal',
      instanceName: 'Crystal PvP',
      shardBuild: '1.0.0',
      accent: '#22D3EE',
      theme: 'dark',
      equippedPath: base.equippedPath,
      sharedConfigPath: base.sharedConfigDir,
      writtenAt: '2026-10-06T12:00:00.000Z'
    })
  })

  it('writes nulls for offline launches without a session', () => {
    const info = buildLauncherInfo({ ...base, session: null })
    expect(info.accountId).toBeNull()
    expect(info.username).toBeNull()
    expect(LauncherInfoSchema.safeParse(info).success).toBe(true)
  })

  it('includes accountBridge only when a bridge serves the launch', () => {
    expect(buildLauncherInfo(base)).not.toHaveProperty('accountBridge')
    expect(buildLauncherInfo({ ...base, accountBridge: null })).not.toHaveProperty('accountBridge')
    const bridge = { url: 'http://127.0.0.1:53123', secret: 'ab'.repeat(32) }
    const info = buildLauncherInfo({ ...base, accountBridge: bridge })
    expect(info.accountBridge).toEqual(bridge)
    expect(LauncherInfoSchema.safeParse(info).success).toBe(true)
  })

  it('rejects an account bridge that is not loopback or has a malformed secret', () => {
    const info = buildLauncherInfo(base)
    const good = { url: 'http://127.0.0.1:53123', secret: 'ab'.repeat(32) }
    expect(LauncherInfoSchema.safeParse({ ...info, accountBridge: { ...good, url: 'http://0.0.0.0:53123' } }).success).toBe(false)
    expect(LauncherInfoSchema.safeParse({ ...info, accountBridge: { ...good, url: 'http://localhost:53123' } }).success).toBe(false)
    expect(LauncherInfoSchema.safeParse({ ...info, accountBridge: { ...good, secret: 'short' } }).success).toBe(false)
  })

  it('only exposes the shared config folder when the layer is active for the instance', () => {
    expect(buildLauncherInfo({ ...base, settings: { ...base.settings, sharedConfig: false } }).sharedConfigPath).toBeNull()
    expect(
      buildLauncherInfo({
        ...base,
        instance: { ...instance, settings: { ...instance.settings, sharedConfig: false } }
      }).sharedConfigPath
    ).toBeNull()
    expect(buildLauncherInfo({ ...base, instance: { ...instance, type: 'vanilla', shardBuild: null } })).toMatchObject({
      sharedConfigPath: null,
      shardBuild: null
    })
  })
})
