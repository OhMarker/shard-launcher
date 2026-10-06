/**
 * Pure PNG helpers for Minecraft skins (pngjs only, no Electron) so they can be unit-tested.
 * Skins are normalised to 64x64 RGBA; legacy 64x32 skins are converted the way the game does it.
 */
import { PNG } from 'pngjs'
import { SKIN_SIZES } from '@shared/constants'
import { ShardError } from '@shared/errors'
import { formatBytes } from '@shared/format'
import { type SkinVariant } from '@shared/types'

export const MAX_SKIN_BYTES = 1024 * 1024
export const PNG_DATA_URL_PREFIX = 'data:image/png;base64,'
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export interface ImportedSkin {
  /** Always 64x64. */
  png: PNG
  variant: SkinVariant
  dataUrl: string
}

export function isPng(buffer: Buffer): boolean {
  return buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
}

/** Parses a PNG and accepts only the two skin layouts (64x64 and legacy 64x32). */
export function decodeSkin(buffer: Buffer): PNG {
  if (buffer.length > MAX_SKIN_BYTES) {
    throw new ShardError('SKIN_INVALID', `Skins must be under ${formatBytes(MAX_SKIN_BYTES, 0)} (this file is ${formatBytes(buffer.length)})`)
  }
  let png: PNG
  try {
    png = PNG.sync.read(buffer)
  } catch (err) {
    throw new ShardError('SKIN_INVALID', 'That file is not a valid PNG image', { cause: err })
  }
  const modern = png.width === SKIN_SIZES.modern.width && png.height === SKIN_SIZES.modern.height
  const legacy = png.width === SKIN_SIZES.legacy.width && png.height === SKIN_SIZES.legacy.height
  if (!modern && !legacy) {
    throw new ShardError(
      'SKIN_INVALID',
      `Skins must be ${SKIN_SIZES.modern.width}x${SKIN_SIZES.modern.height} or ${SKIN_SIZES.legacy.width}x${SKIN_SIZES.legacy.height} pixels; this image is ${png.width}x${png.height}`
    )
  }
  return png
}

export function isLegacySkin(png: PNG): boolean {
  return png.height === SKIN_SIZES.legacy.height
}

/** Copies a `w`x`h` block, flipping it horizontally. */
function copyMirrored(src: PNG, dst: PNG, sx: number, sy: number, w: number, h: number, dx: number, dy: number): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const from = ((sy + y) * src.width + sx + x) * 4
      const to = ((dy + y) * dst.width + dx + (w - 1 - x)) * 4
      src.data.copy(dst.data, to, from, from + 4)
    }
  }
}

/**
 * Mirrors one 16x16 limb into another position. Every face is flipped horizontally and the two
 * side faces swap places, which is exactly what the game does when it builds a right limb from
 * a left one. Layout within a limb: row 0-3 has top (x 4-7) and bottom (x 8-11); rows 4-15 have
 * side A (x 0-3), front (x 4-7), side B (x 8-11), back (x 12-15).
 */
function mirrorLimb(src: PNG, dst: PNG, sx: number, sy: number, dx: number, dy: number): void {
  copyMirrored(src, dst, sx + 4, sy, 4, 4, dx + 4, dy)
  copyMirrored(src, dst, sx + 8, sy, 4, 4, dx + 8, dy)
  copyMirrored(src, dst, sx + 8, sy + 4, 4, 12, dx, dy + 4)
  copyMirrored(src, dst, sx + 4, sy + 4, 4, 12, dx + 4, dy + 4)
  copyMirrored(src, dst, sx, sy + 4, 4, 12, dx + 8, dy + 4)
  copyMirrored(src, dst, sx + 12, sy + 4, 4, 12, dx + 12, dy + 4)
}

/** 64x32 -> 64x64: the top half is copied, the leg and arm are mirrored into the right-limb slots. */
export function convertLegacySkin(legacy: PNG): PNG {
  const out = new PNG({ width: SKIN_SIZES.modern.width, height: SKIN_SIZES.modern.height })
  PNG.bitblt(legacy, out, 0, 0, SKIN_SIZES.legacy.width, SKIN_SIZES.legacy.height, 0, 0)
  mirrorLimb(legacy, out, 0, 16, 16, 48)
  mirrorLimb(legacy, out, 40, 16, 32, 48)
  return out
}

/** Slim (3px wide) arms leave column 54 of the arm texture unused, so a transparent pixel there means slim. */
export function detectVariant(png: PNG): SkinVariant {
  const alpha = png.data[(20 * png.width + 54) * 4 + 3]
  return alpha === 0 ? 'slim' : 'classic'
}

export function toDataUrl(png: PNG): string {
  return `${PNG_DATA_URL_PREFIX}${PNG.sync.write(png).toString('base64')}`
}

export function fromDataUrl(dataUrl: string): Buffer {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new ShardError('SKIN_INVALID', 'Saved skin data is not a PNG data URL')
  }
  const buffer = Buffer.from(dataUrl.slice(PNG_DATA_URL_PREFIX.length), 'base64')
  if (!isPng(buffer)) throw new ShardError('SKIN_INVALID', 'Saved skin data is not a PNG image')
  return buffer
}

/** Decode, convert legacy skins to 64x64, detect the arm model and re-encode as a data URL. */
export function importSkin(buffer: Buffer): ImportedSkin {
  const decoded = decodeSkin(buffer)
  const png = isLegacySkin(decoded) ? convertLegacySkin(decoded) : decoded
  return { png, variant: detectVariant(png), dataUrl: toDataUrl(png) }
}
