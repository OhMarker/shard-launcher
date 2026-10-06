import { describe, expect, it } from 'vitest'
import { type VersionJson } from '@shared/schemas/mojang'
import { libraryKey, mergeLibraries, mergeProfiles } from '@main/fabric/merge'

const vanilla: VersionJson = {
  id: '1.21.4',
  type: 'release',
  mainClass: 'net.minecraft.client.main.Main',
  assets: '19',
  assetIndex: { id: '19', sha1: 'dc6757fadfa8abf306e90465661ec4a7dcd3386a', size: 464718, url: 'https://example/19.json' },
  javaVersion: { component: 'java-runtime-delta', majorVersion: 21 },
  downloads: {
    client: { sha1: 'a7e5a6024bfd3cd614625aa05629adf760020304', size: 28335587, url: 'https://example/client.jar' }
  },
  arguments: {
    jvm: ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}'],
    game: ['--username', '${auth_player_name}']
  },
  libraries: [
    {
      name: 'org.ow2.asm:asm:9.6',
      downloads: { artifact: { path: 'org/ow2/asm/asm/9.6/asm-9.6.jar', sha1: 'old', size: 1, url: 'https://example/asm-9.6.jar' } }
    },
    {
      name: 'org.lwjgl:lwjgl:3.3.3',
      downloads: { artifact: { path: 'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3.jar', sha1: 'l', size: 1, url: 'https://example/lwjgl.jar' } }
    },
    {
      name: 'org.lwjgl:lwjgl:3.3.3:natives-windows',
      downloads: {
        artifact: {
          path: 'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar',
          sha1: 'n',
          size: 1,
          url: 'https://example/lwjgl-natives.jar'
        }
      },
      rules: [{ action: 'allow', os: { name: 'windows' } }]
    }
  ]
}

const fabric: VersionJson = {
  id: 'fabric-loader-0.19.5-1.21.4',
  inheritsFrom: '1.21.4',
  type: 'release',
  mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
  arguments: { game: [], jvm: ['-DFabricMcEmu= net.minecraft.client.main.Main '] },
  libraries: [
    { name: 'org.ow2.asm:asm:9.10.1', url: 'https://maven.fabricmc.net/', sha1: 'new', size: 126151 },
    { name: 'net.fabricmc:intermediary:1.21.4', url: 'https://maven.fabricmc.net/' },
    { name: 'net.fabricmc:fabric-loader:0.19.5', url: 'https://maven.fabricmc.net/' }
  ]
}

describe('libraryKey', () => {
  it('ignores the version but keeps the classifier', () => {
    expect(libraryKey('org.ow2.asm:asm:9.6')).toBe('org.ow2.asm:asm')
    expect(libraryKey('org.ow2.asm:asm:9.10.1')).toBe('org.ow2.asm:asm')
    expect(libraryKey('org.lwjgl:lwjgl:3.3.3:natives-windows')).toBe('org.lwjgl:lwjgl:natives-windows')
    expect(libraryKey('com.example:thing:1.0@zip')).toBe('com.example:thing')
  })
})

describe('mergeLibraries', () => {
  it('keeps the first occurrence so the primary list wins', () => {
    const merged = mergeLibraries(fabric.libraries, vanilla.libraries)
    const asm = merged.filter((l) => libraryKey(l.name) === 'org.ow2.asm:asm')
    expect(asm).toHaveLength(1)
    expect(asm[0]?.name).toBe('org.ow2.asm:asm:9.10.1')
  })
})

describe('mergeProfiles', () => {
  const merged = mergeProfiles(vanilla, fabric)

  it('lists Fabric libraries first and de-duplicates with Fabric precedence', () => {
    const names = merged.libraries.map((l) => l.name)
    expect(names.slice(0, 3)).toEqual([
      'org.ow2.asm:asm:9.10.1',
      'net.fabricmc:intermediary:1.21.4',
      'net.fabricmc:fabric-loader:0.19.5'
    ])
    expect(names).not.toContain('org.ow2.asm:asm:9.6')
    expect(names).toContain('org.lwjgl:lwjgl:3.3.3')
    expect(names).toContain('org.lwjgl:lwjgl:3.3.3:natives-windows')
    expect(names).toHaveLength(5)
  })

  it('takes id and mainClass from Fabric', () => {
    expect(merged.id).toBe('fabric-loader-0.19.5-1.21.4')
    expect(merged.inheritsFrom).toBe('1.21.4')
    expect(merged.mainClass).toBe('net.fabricmc.loader.impl.launch.knot.KnotClient')
  })

  it('concatenates arguments vanilla first, then Fabric', () => {
    expect(merged.arguments?.jvm).toEqual([
      '-Djava.library.path=${natives_directory}',
      '-cp',
      '${classpath}',
      '-DFabricMcEmu= net.minecraft.client.main.Main '
    ])
    expect(merged.arguments?.game).toEqual(['--username', '${auth_player_name}'])
  })

  it('keeps downloads, assets, javaVersion and type from vanilla', () => {
    expect(merged.downloads).toEqual(vanilla.downloads)
    expect(merged.assetIndex).toEqual(vanilla.assetIndex)
    expect(merged.assets).toBe('19')
    expect(merged.javaVersion).toEqual({ component: 'java-runtime-delta', majorVersion: 21 })
    expect(merged.type).toBe('release')
  })

  it('does not mutate its inputs', () => {
    expect(vanilla.libraries).toHaveLength(3)
    expect(vanilla.mainClass).toBe('net.minecraft.client.main.Main')
    expect(fabric.libraries).toHaveLength(3)
  })

  it('leaves arguments undefined when neither side has them', () => {
    const legacyVanilla: VersionJson = { ...vanilla, arguments: undefined, minecraftArguments: '--username ${auth_player_name}' }
    const legacyFabric: VersionJson = { ...fabric, arguments: undefined }
    const legacy = mergeProfiles(legacyVanilla, legacyFabric)
    expect(legacy.arguments).toBeUndefined()
    expect(legacy.minecraftArguments).toBe('--username ${auth_player_name}')
  })
})
