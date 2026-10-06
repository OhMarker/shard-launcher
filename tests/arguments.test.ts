import { describe, expect, it } from 'vitest'
import { type VersionJson } from '@shared/schemas/mojang'
import {
  buildArguments,
  CLIENT_ID,
  DEFAULT_JVM_FLAGS,
  substitutePlaceholders,
  type ArgumentParams
} from '@main/minecraft/arguments'
import { launchFeatures, type OsInfo } from '@main/minecraft/rules'

/** A trimmed 1.21-style version JSON with every argument shape Mojang uses. */
const version: VersionJson = {
  id: '1.21.4',
  type: 'release',
  mainClass: 'net.minecraft.client.main.Main',
  libraries: [],
  arguments: {
    jvm: [
      { rules: [{ action: 'allow', os: { name: 'osx' } }], value: ['-XstartOnFirstThread'] },
      {
        rules: [{ action: 'allow', os: { name: 'windows' } }],
        value: '-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump'
      },
      { rules: [{ action: 'allow', os: { arch: 'x86' } }], value: '-Xss1M' },
      '-Djava.library.path=${natives_directory}',
      '-Djna.tmpdir=${natives_directory}',
      '-Dminecraft.launcher.brand=${launcher_name}',
      '-Dminecraft.launcher.version=${launcher_version}',
      '-cp',
      '${classpath}'
    ],
    game: [
      '--username',
      '${auth_player_name}',
      '--version',
      '${version_name}',
      '--gameDir',
      '${game_directory}',
      '--assetsDir',
      '${assets_root}',
      '--assetIndex',
      '${assets_index_name}',
      '--uuid',
      '${auth_uuid}',
      '--accessToken',
      '${auth_access_token}',
      '--clientId',
      '${clientid}',
      '--xuid',
      '${auth_xuid}',
      '--userType',
      '${user_type}',
      '--versionType',
      '${version_type}',
      { rules: [{ action: 'allow', features: { is_demo_user: true } }], value: '--demo' },
      {
        rules: [{ action: 'allow', features: { has_custom_resolution: true } }],
        value: ['--width', '${resolution_width}', '--height', '${resolution_height}']
      },
      {
        rules: [{ action: 'allow', features: { has_quick_plays_support: true } }],
        value: ['--quickPlayPath', '${quickPlayPath}']
      },
      {
        rules: [{ action: 'allow', features: { is_quick_play_multiplayer: true } }],
        value: ['--quickPlayMultiplayer', '${quickPlayMultiplayer}']
      }
    ]
  }
}

const windows: OsInfo = { name: 'windows', arch: 'x64', version: '10.0.26300' }
const linux: OsInfo = { name: 'linux', arch: 'x64', version: '6.8.0' }
const mac: OsInfo = { name: 'osx', arch: 'arm64', version: '23.1.0' }

function params(overrides: Partial<ArgumentParams> = {}): ArgumentParams {
  return {
    os: windows,
    features: launchFeatures({ fullscreen: false }),
    session: {
      username: 'Steve',
      uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
      accessToken: 'token-123',
      xuid: '2535400000000000'
    },
    versionName: 'fabric-loader-0.19.5-1.21.4',
    versionType: 'release',
    gameDirectory: 'C:\\Shard\\instances\\Shard 1.21.4',
    assetsRoot: 'C:\\Shard\\assets',
    assetsIndexName: '19',
    nativesDirectory: 'C:\\Shard\\instances\\Shard 1.21.4\\natives',
    libraryDirectory: 'C:\\Shard\\libraries',
    launcherVersion: '0.1.0',
    classpath: ['C:\\Shard\\libraries\\a.jar', 'C:\\Shard\\libraries\\b.jar', 'C:\\Shard\\versions\\1.21.4\\1.21.4.jar'],
    memoryMb: 4096,
    jvmArgs: ['-Dshard.test=1'],
    gameArgs: ['--extra'],
    width: 1280,
    height: 720,
    fullscreen: false,
    ...overrides
  }
}

describe('buildArguments', () => {
  it('substitutes every placeholder', () => {
    const built = buildArguments(version, params())
    for (const arg of [...built.jvm, ...built.game]) expect(arg).not.toContain('${')
    expect(built.mainClass).toBe('net.minecraft.client.main.Main')

    const game = built.game
    expect(game.slice(game.indexOf('--username'), game.indexOf('--username') + 2)).toEqual(['--username', 'Steve'])
    expect(game[game.indexOf('--uuid') + 1]).toBe('069a79f444e94726a5befca90e38aaf5')
    expect(game[game.indexOf('--accessToken') + 1]).toBe('token-123')
    expect(game[game.indexOf('--xuid') + 1]).toBe('2535400000000000')
    expect(game[game.indexOf('--userType') + 1]).toBe('msa')
    expect(game[game.indexOf('--clientId') + 1]).toBe(CLIENT_ID)
    expect(game[game.indexOf('--version') + 1]).toBe('fabric-loader-0.19.5-1.21.4')
    expect(game[game.indexOf('--versionType') + 1]).toBe('release')
    expect(game[game.indexOf('--assetIndex') + 1]).toBe('19')
    expect(game[game.indexOf('--gameDir') + 1]).toBe('C:\\Shard\\instances\\Shard 1.21.4')
    expect(built.jvm).toContain('-Dminecraft.launcher.brand=shard-launcher')
    expect(built.jvm).toContain('-Dminecraft.launcher.version=0.1.0')
    expect(built.jvm).toContain('-Djava.library.path=C:\\Shard\\instances\\Shard 1.21.4\\natives')
  })

  it('uses ; as the classpath separator on Windows and : elsewhere', () => {
    const win = buildArguments(version, params({ os: windows }))
    expect(win.jvm[win.jvm.indexOf('-cp') + 1]).toBe(
      'C:\\Shard\\libraries\\a.jar;C:\\Shard\\libraries\\b.jar;C:\\Shard\\versions\\1.21.4\\1.21.4.jar'
    )
    const nix = buildArguments(version, params({ os: linux, classpath: ['/a.jar', '/b.jar'] }))
    expect(nix.jvm[nix.jvm.indexOf('-cp') + 1]).toBe('/a.jar:/b.jar')
  })

  it('applies os rules to jvm arguments', () => {
    const win = buildArguments(version, params({ os: windows }))
    expect(win.jvm.some((a) => a.startsWith('-XX:HeapDumpPath='))).toBe(true)
    expect(win.jvm).not.toContain('-XstartOnFirstThread')
    expect(win.jvm).not.toContain('-Xss1M')

    const osx = buildArguments(version, params({ os: mac }))
    expect(osx.jvm).toContain('-XstartOnFirstThread')
    expect(osx.jvm.some((a) => a.startsWith('-XX:HeapDumpPath='))).toBe(false)

    const x86 = buildArguments(version, params({ os: { ...windows, arch: 'x86' } }))
    expect(x86.jvm).toContain('-Xss1M')
  })

  it('adds resolution when windowed and --fullscreen when fullscreen', () => {
    const windowed = buildArguments(version, params())
    expect(windowed.game).toContain('--width')
    expect(windowed.game[windowed.game.indexOf('--width') + 1]).toBe('1280')
    expect(windowed.game[windowed.game.indexOf('--height') + 1]).toBe('720')
    expect(windowed.game).not.toContain('--fullscreen')

    const full = buildArguments(version, params({ fullscreen: true, features: launchFeatures({ fullscreen: true }) }))
    expect(full.game).not.toContain('--width')
    expect(full.game).not.toContain('--height')
    expect(full.game[full.game.length - 1]).toBe('--fullscreen')
  })

  it('never enables demo mode or quick play', () => {
    const built = buildArguments(version, params())
    expect(built.game).not.toContain('--demo')
    expect(built.game).not.toContain('--quickPlayPath')
    expect(built.game).not.toContain('--quickPlayMultiplayer')
  })

  it('prepends memory, GC defaults and user jvm args; appends user game args', () => {
    const built = buildArguments(version, params({ memoryMb: 6144 }))
    expect(built.jvm.slice(0, 2)).toEqual(['-Xms2048M', '-Xmx6144M'])
    expect(built.jvm.slice(2, 2 + DEFAULT_JVM_FLAGS.length)).toEqual([...DEFAULT_JVM_FLAGS])
    expect(built.jvm[2 + DEFAULT_JVM_FLAGS.length]).toBe('-Dshard.test=1')
    expect(built.game).toContain('--extra')
    expect(built.game.indexOf('--extra')).toBeGreaterThan(built.game.indexOf('--versionType'))

    const small = buildArguments(version, params({ memoryMb: 1024 }))
    expect(small.jvm.slice(0, 2)).toEqual(['-Xms1024M', '-Xmx1024M'])
  })

  it('falls back to minecraftArguments for legacy version JSONs', () => {
    const legacy: VersionJson = {
      id: 'legacy',
      type: 'release',
      mainClass: 'net.minecraft.client.main.Main',
      libraries: [],
      minecraftArguments: '--username ${auth_player_name} --session ${auth_session} --gameDir ${game_directory} --unknown ${nope}'
    }
    const built = buildArguments(legacy, params({ os: linux, classpath: ['/a.jar', '/b.jar'] }))
    expect(built.jvm).toContain('-Djava.library.path=C:\\Shard\\instances\\Shard 1.21.4\\natives')
    expect(built.jvm[built.jvm.indexOf('-cp') + 1]).toBe('/a.jar:/b.jar')
    expect(built.game).toEqual([
      '--username',
      'Steve',
      '--session',
      'token-123',
      '--gameDir',
      'C:\\Shard\\instances\\Shard 1.21.4',
      '--unknown',
      '',
      '--extra'
    ])
  })
})

describe('substitutePlaceholders', () => {
  it('replaces known names and blanks unknown ones', () => {
    expect(substitutePlaceholders('${a}-${b}-${c}', { a: '1', b: '2' })).toBe('1-2-')
    expect(substitutePlaceholders('plain', {})).toBe('plain')
  })
})
