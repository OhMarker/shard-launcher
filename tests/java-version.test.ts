import { describe, expect, it } from 'vitest'
import { majorFromVersionName, parseJavaVersion } from '@main/java/version'

describe('parseJavaVersion', () => {
  it('parses a modern OpenJDK banner', () => {
    const output = [
      'openjdk version "21.0.3" 2024-04-16 LTS',
      'OpenJDK Runtime Environment Temurin-21.0.3+9 (build 21.0.3+9-LTS)',
      'OpenJDK 64-Bit Server VM Temurin-21.0.3+9 (build 21.0.3+9-LTS, mixed mode, sharing)'
    ].join('\n')
    expect(parseJavaVersion(output)).toEqual({ version: '21.0.3', major: 21 })
  })

  it('parses Java 17', () => {
    expect(parseJavaVersion('openjdk version "17.0.9" 2023-10-17\nOpenJDK Runtime Environment (build 17.0.9+9)')).toEqual({
      version: '17.0.9',
      major: 17
    })
  })

  it('parses the legacy 1.8 scheme', () => {
    const output = 'openjdk version "1.8.0_392"\nOpenJDK Runtime Environment (build 1.8.0_392-b08)\nOpenJDK 64-Bit Server VM (build 25.392-b08, mixed mode)'
    expect(parseJavaVersion(output)).toEqual({ version: '1.8.0_392', major: 8 })
  })

  it('parses Oracle style output and early-access builds', () => {
    expect(parseJavaVersion('java version "21.0.1" 2023-10-17 LTS')).toEqual({ version: '21.0.1', major: 21 })
    expect(parseJavaVersion('openjdk version "22-ea" 2024-03-19')).toEqual({ version: '22-ea', major: 22 })
  })

  it('returns null for garbage', () => {
    expect(parseJavaVersion('')).toBeNull()
    expect(parseJavaVersion("'java' is not recognized as an internal or external command")).toBeNull()
    expect(parseJavaVersion('version "potato"')).toBeNull()
    expect(parseJavaVersion('Error: could not open libjvm.so')).toBeNull()
  })
})

describe('majorFromVersionName', () => {
  it('handles Mojang runtime version names', () => {
    expect(majorFromVersionName('21.0.7')).toBe(21)
    expect(majorFromVersionName('17.0.15')).toBe(17)
    expect(majorFromVersionName('16.0.1.9.1')).toBe(16)
    expect(majorFromVersionName('8u51-cacert462b08')).toBe(8)
    expect(majorFromVersionName('1.8.0_51')).toBe(8)
  })

  it('rejects names without a leading number', () => {
    expect(majorFromVersionName('')).toBeNull()
    expect(majorFromVersionName('latest')).toBeNull()
    expect(majorFromVersionName('1')).toBeNull()
  })
})
