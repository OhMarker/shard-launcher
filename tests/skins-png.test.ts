import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { ShardError } from '@shared/errors'
import {
  convertLegacySkin,
  decodeSkin,
  detectVariant,
  fromDataUrl,
  importSkin,
  MAX_SKIN_BYTES,
  toDataUrl
} from '@main/skins/png'

type Rgba = [number, number, number, number]

const OPAQUE: Rgba = [200, 200, 200, 255]
const CLEAR: Rgba = [0, 0, 0, 0]
const RED: Rgba = [255, 0, 0, 255]
const GREEN: Rgba = [0, 255, 0, 255]
const BLUE: Rgba = [0, 0, 255, 255]
const YELLOW: Rgba = [255, 255, 0, 255]
const MAGENTA: Rgba = [255, 0, 255, 255]
const CYAN: Rgba = [0, 255, 255, 255]

function filled(width: number, height: number, color: Rgba): PNG {
  const png = new PNG({ width, height })
  for (let i = 0; i < width * height; i++) png.data.set(color, i * 4)
  return png
}

function setPixel(png: PNG, x: number, y: number, color: Rgba): void {
  png.data.set(color, (y * png.width + x) * 4)
}

function getPixel(png: PNG, x: number, y: number): Rgba {
  const i = (y * png.width + x) * 4
  return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!, png.data[i + 3]!]
}

function encode(png: PNG): Buffer {
  return PNG.sync.write(png)
}

describe('decodeSkin', () => {
  it('accepts 64x64 and 64x32 skins', () => {
    expect(decodeSkin(encode(filled(64, 64, OPAQUE))).height).toBe(64)
    expect(decodeSkin(encode(filled(64, 32, OPAQUE))).height).toBe(32)
  })

  it('rejects other dimensions and names them', () => {
    expect(() => decodeSkin(encode(filled(32, 32, OPAQUE)))).toThrowError(/32x32/)
    expect(() => decodeSkin(encode(filled(128, 128, OPAQUE)))).toThrowError(/128x128/)
    try {
      decodeSkin(encode(filled(64, 128, OPAQUE)))
    } catch (err) {
      expect(err).toBeInstanceOf(ShardError)
      expect((err as ShardError).code).toBe('SKIN_INVALID')
    }
  })

  it('rejects files that are not PNGs or are too large', () => {
    expect(() => decodeSkin(Buffer.from('definitely not a png'))).toThrowError(ShardError)
    const huge = Buffer.alloc(MAX_SKIN_BYTES + 1)
    try {
      decodeSkin(huge)
      throw new Error('expected rejection')
    } catch (err) {
      expect((err as ShardError).code).toBe('SKIN_INVALID')
      expect((err as ShardError).message).toMatch(/1 MB/)
    }
  })
})

describe('convertLegacySkin', () => {
  it('produces a 64x64 image with the top half copied verbatim', () => {
    const legacy = filled(64, 32, OPAQUE)
    setPixel(legacy, 10, 10, RED)
    const out = convertLegacySkin(legacy)
    expect(out.width).toBe(64)
    expect(out.height).toBe(64)
    expect(getPixel(out, 10, 10)).toEqual(RED)
    expect(getPixel(out, 63, 31)).toEqual(OPAQUE)
    // Regions the legacy format never had (left-leg overlay, right-arm overlay) stay transparent.
    expect(getPixel(out, 5, 40)).toEqual(CLEAR)
    expect(getPixel(out, 55, 40)).toEqual(CLEAR)
  })

  it('mirrors the leg into (16,48) with side faces swapped and every face flipped', () => {
    const legacy = filled(64, 32, OPAQUE)
    setPixel(legacy, 0, 20, RED) // side A, first column
    setPixel(legacy, 4, 20, BLUE) // front, first column
    setPixel(legacy, 8, 20, GREEN) // side B, first column
    setPixel(legacy, 12, 20, YELLOW) // back, first column
    setPixel(legacy, 4, 16, MAGENTA) // top, first column
    const out = convertLegacySkin(legacy)
    expect(getPixel(out, 27, 52)).toEqual(RED) // side A lands in side B's slot, flipped
    expect(getPixel(out, 23, 52)).toEqual(BLUE) // front stays in place, flipped
    expect(getPixel(out, 19, 52)).toEqual(GREEN) // side B lands in side A's slot, flipped
    expect(getPixel(out, 31, 52)).toEqual(YELLOW) // back stays in place, flipped
    expect(getPixel(out, 23, 48)).toEqual(MAGENTA) // top flipped
    // The original left leg is untouched.
    expect(getPixel(out, 0, 20)).toEqual(RED)
  })

  it('mirrors the arm into (32,48) the same way', () => {
    const legacy = filled(64, 32, OPAQUE)
    setPixel(legacy, 40, 20, CYAN) // side A, first column
    setPixel(legacy, 44, 20, BLUE) // front, first column
    setPixel(legacy, 48, 31, GREEN) // side B, first column, last row
    const out = convertLegacySkin(legacy)
    expect(getPixel(out, 43, 52)).toEqual(CYAN)
    expect(getPixel(out, 39, 52)).toEqual(BLUE)
    expect(getPixel(out, 35, 63)).toEqual(GREEN)
  })
})

describe('detectVariant', () => {
  it('reports classic when the arm column is painted', () => {
    expect(detectVariant(filled(64, 64, OPAQUE))).toBe('classic')
  })

  it('reports slim when (54,20) is fully transparent', () => {
    const png = filled(64, 64, OPAQUE)
    setPixel(png, 54, 20, CLEAR)
    expect(detectVariant(png)).toBe('slim')
    setPixel(png, 54, 20, [0, 0, 0, 1])
    expect(detectVariant(png)).toBe('classic')
  })
})

describe('data URLs and importSkin', () => {
  it('round-trips through a PNG data URL', () => {
    const png = filled(64, 64, OPAQUE)
    setPixel(png, 3, 3, RED)
    const dataUrl = toDataUrl(png)
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    const decoded = PNG.sync.read(fromDataUrl(dataUrl))
    expect(getPixel(decoded, 3, 3)).toEqual(RED)
    expect(() => fromDataUrl('data:text/plain;base64,aGk=')).toThrowError(ShardError)
  })

  it('normalises legacy skins to 64x64 classic', () => {
    const imported = importSkin(encode(filled(64, 32, OPAQUE)))
    expect(imported.png.height).toBe(64)
    expect(imported.variant).toBe('classic')
    expect(PNG.sync.read(fromDataUrl(imported.dataUrl)).height).toBe(64)
  })

  it('keeps 64x64 skins and detects slim arms', () => {
    const slim = filled(64, 64, OPAQUE)
    setPixel(slim, 54, 20, CLEAR)
    const imported = importSkin(encode(slim))
    expect(imported.variant).toBe('slim')
    expect(getPixel(imported.png, 54, 20)).toEqual(CLEAR)
  })
})
