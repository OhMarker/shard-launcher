import { describe, expect, it } from 'vitest'
import { mavenToPath } from '@main/paths'

describe('mavenToPath', () => {
  it('maps plain coordinates', () => {
    expect(mavenToPath('net.fabricmc:fabric-loader:0.16.9')).toBe(
      'net/fabricmc/fabric-loader/0.16.9/fabric-loader-0.16.9.jar'
    )
  })
  it('handles classifiers and extensions', () => {
    expect(mavenToPath('org.lwjgl:lwjgl:3.3.3:natives-windows')).toBe(
      'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar'
    )
    expect(mavenToPath('com.example:thing:1.0@zip')).toBe('com/example/thing/1.0/thing-1.0.zip')
  })
})
