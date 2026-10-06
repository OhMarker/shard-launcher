import { describe, expect, it } from 'vitest'
import {
  canonicalJarName,
  disabledJarName,
  fileNameFor,
  isDisabledJarName,
  isJarName,
  isModFileName,
  isSafeFileName,
  isShardJarName,
  modDisplayName
} from '@main/mods/filenames'
import { escapeControlCharsInStrings, parseFabricModJson } from '@main/mods/jar'
import { sanitizeRelativePath } from '@main/mods/mrpack'

describe('mod file names', () => {
  it('recognises jars and disabled jars', () => {
    expect(isJarName('sodium-0.6.jar')).toBe(true)
    expect(isJarName('Sodium.JAR')).toBe(true)
    expect(isJarName('sodium.jar.disabled')).toBe(false)
    expect(isDisabledJarName('sodium.jar.disabled')).toBe(true)
    expect(isDisabledJarName('sodium.jar')).toBe(false)
    expect(isModFileName('readme.txt')).toBe(false)
    expect(isModFileName('a.jar')).toBe(true)
    expect(isModFileName('a.jar.disabled')).toBe(true)
  })

  it('toggles between .jar and .jar.disabled without stacking suffixes', () => {
    expect(canonicalJarName('lithium.jar.disabled')).toBe('lithium.jar')
    expect(canonicalJarName('lithium.jar')).toBe('lithium.jar')
    expect(disabledJarName('lithium.jar')).toBe('lithium.jar.disabled')
    expect(disabledJarName('lithium.jar.disabled')).toBe('lithium.jar.disabled')
    expect(fileNameFor('lithium.jar.disabled', true)).toBe('lithium.jar')
    expect(fileNameFor('lithium.jar', false)).toBe('lithium.jar.disabled')
    expect(fileNameFor('lithium.jar', true)).toBe('lithium.jar')
  })

  it('detects Shard client jars in either state', () => {
    expect(isShardJarName('shard-1.4.0.jar')).toBe(true)
    expect(isShardJarName('Shard-1.4.0+mc1.21.4.jar')).toBe(true)
    expect(isShardJarName('shard-1.4.0.jar.disabled')).toBe(true)
    expect(isShardJarName('shard.jar')).toBe(false)
    expect(isShardJarName('shardling-mod.jar')).toBe(false)
    expect(isShardJarName('my-shard-addon.jar')).toBe(false)
  })

  it('derives display names and rejects unsafe names', () => {
    expect(modDisplayName('sodium-fabric-0.6.13+mc1.21.4.jar.disabled')).toBe('sodium-fabric-0.6.13+mc1.21.4')
    expect(isSafeFileName('sodium.jar')).toBe(true)
    expect(isSafeFileName('../sodium.jar')).toBe(false)
    expect(isSafeFileName('mods\\sodium.jar')).toBe(false)
    expect(isSafeFileName('')).toBe(false)
    expect(isSafeFileName('..')).toBe(false)
  })
})

describe('mrpack paths', () => {
  it('normalises safe relative paths and rejects escapes', () => {
    expect(sanitizeRelativePath('mods/sodium.jar')).toBe('mods/sodium.jar')
    expect(sanitizeRelativePath('config\\sodium-options.json')).toBe('config/sodium-options.json')
    expect(sanitizeRelativePath('./mods/./a.jar')).toBe('mods/a.jar')
    expect(sanitizeRelativePath('../outside.jar')).toBeNull()
    expect(sanitizeRelativePath('mods/../../outside.jar')).toBeNull()
    expect(sanitizeRelativePath('/etc/passwd')).toBeNull()
    expect(sanitizeRelativePath('C:\\Windows\\x.jar')).toBeNull()
    expect(sanitizeRelativePath('')).toBeNull()
  })
})

describe('fabric.mod.json parsing', () => {
  it('reads the display fields and falls back to the id for the name', () => {
    expect(parseFabricModJson('{"schemaVersion":1,"id":"sodium","version":"0.6.13","name":"Sodium","description":"Fast"}')).toEqual({
      id: 'sodium',
      name: 'Sodium',
      version: '0.6.13',
      description: 'Fast'
    })
    expect(parseFabricModJson('{"id":"lithium","version":"0.14"}')).toEqual({
      id: 'lithium',
      name: 'lithium',
      version: '0.14',
      description: null
    })
  })

  it('tolerates raw newlines inside strings and rejects garbage', () => {
    const lenient = '{"id":"x","version":"1","description":"line one\nline two"}'
    expect(parseFabricModJson(lenient)?.description).toBe('line one\nline two')
    expect(escapeControlCharsInStrings('{"a":"b\\"c\nd"}')).toBe('{"a":"b\\"c\\nd"}')
    expect(parseFabricModJson('not json')).toBeNull()
    expect(parseFabricModJson('{"version":"1"}')).toBeNull()
  })
})
