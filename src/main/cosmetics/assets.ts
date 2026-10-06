import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ShardError } from '@shared/errors'
import { type Cosmetic } from '@shared/types'
import { type AppContext } from '../context'
import { createLogger } from '../logger'
import { downloadToBuffer, writeBufferAtomic } from '../net/downloader'
import { exists } from '../util/fs'
import { CAPE_LAYOUT_TYPES, pngDimensions, resolveAssetUrl } from './rules'

const log = createLogger('cosmetics')

export type AssetKind = 'texture' | 'preview'

const CACHE_SUBDIR: Record<AssetKind, string> = { texture: 'textures', preview: 'previews' }

function sourceUrl(cosmetic: Cosmetic, kind: AssetKind): string | null {
  return kind === 'texture' ? cosmetic.textureUrl : cosmetic.previewUrl
}

function toDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString('base64')}`
}

/**
 * Resolves cosmetic textures and preview cards to PNG bytes. Bundled assets are read from the
 * resources folder; remote ones are downloaded once into `<data>/cosmetics/{textures,previews}`.
 * Data URLs are memoised per cosmetic and URL for the lifetime of the process.
 */
export class CosmeticAssets {
  private readonly memo = new Map<string, Promise<string>>()

  constructor(private readonly ctx: Pick<AppContext, 'resourcesDir' | 'paths'>) {}

  /** Local cache file for a remote asset. The id comes from a manifest, so it is kept to safe characters. */
  cachePath(cosmetic: Cosmetic, kind: AssetKind): string {
    const safeId = cosmetic.id.replace(/[^A-Za-z0-9._-]/g, '_')
    return join(this.ctx.paths.cosmetics, CACHE_SUBDIR[kind], `${safeId}.png`)
  }

  /** Data URL for the renderer's live preview. Throws when the cosmetic has no such asset. */
  dataUrl(cosmetic: Cosmetic, kind: AssetKind): Promise<string> {
    const url = sourceUrl(cosmetic, kind)
    if (url === null) {
      return Promise.reject(new ShardError('NOT_FOUND', `${cosmetic.name} has no ${kind}`))
    }
    const key = `${kind}:${cosmetic.id}:${url}`
    let pending = this.memo.get(key)
    if (!pending) {
      pending = this.load(cosmetic, kind, url).then(toDataUrl)
      pending.catch(() => this.memo.delete(key))
      this.memo.set(key, pending)
    }
    return pending
  }

  /** Makes sure a remote asset is present in the local cache so the game can read it offline. */
  async ensureLocal(cosmetic: Cosmetic, kind: AssetKind): Promise<void> {
    const url = sourceUrl(cosmetic, kind)
    if (url === null) return
    const resolved = resolveAssetUrl(url)
    if (resolved.kind === 'bundled') return
    const dest = this.cachePath(cosmetic, kind)
    if (await exists(dest)) return
    await this.fetchRemote(cosmetic, kind, resolved.url, dest)
  }

  private async load(cosmetic: Cosmetic, kind: AssetKind, url: string): Promise<Buffer> {
    const resolved = resolveAssetUrl(url)
    if (resolved.kind === 'bundled') {
      const png = await readFile(join(this.ctx.resourcesDir, resolved.relativePath))
      return this.validate(cosmetic, kind, png, url)
    }
    const dest = this.cachePath(cosmetic, kind)
    if (await exists(dest)) {
      const cached = await readFile(dest)
      if (pngDimensions(cached)) return cached
      log.warn(`Cached ${kind} for ${cosmetic.id} is not a PNG; re-downloading`)
    }
    return this.fetchRemote(cosmetic, kind, resolved.url, dest)
  }

  private async fetchRemote(cosmetic: Cosmetic, kind: AssetKind, url: string, dest: string): Promise<Buffer> {
    const png = this.validate(cosmetic, kind, await downloadToBuffer(url), url)
    await writeBufferAtomic(dest, png)
    log.debug(`Cached ${kind} for ${cosmetic.id} from ${url}`)
    return png
  }

  private validate(cosmetic: Cosmetic, kind: AssetKind, png: Buffer, url: string): Buffer {
    const size = pngDimensions(png)
    if (!size) {
      throw new ShardError('MANIFEST_INVALID', `${cosmetic.name} ${kind} at ${url} is not a PNG`)
    }
    if (kind === 'texture' && CAPE_LAYOUT_TYPES.has(cosmetic.type) && size.width !== size.height * 2) {
      log.warn(`${cosmetic.id} texture is ${size.width}x${size.height}; capes use a 2:1 layout such as 64x32`)
    }
    return png
  }
}
