import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { type Cosmetic } from '@shared/types'
import { CosmeticAssets } from '@main/cosmetics/assets'

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

const cape: Cosmetic = {
  id: 'cape-ohmarker',
  type: 'cape',
  name: 'OhMarker Cape',
  rarity: 'mythic',
  textureUrl: 'bundled://cosmetics/textures/cape-ohmarker.png',
  previewUrl: 'bundled://cosmetics/previews/cape-ohmarker.png',
  animated: false,
  author: 'OhMarker',
  description: '',
  availability: 'free',
  tags: []
}

describe('CosmeticAssets.ensureLocal', () => {
  it('copies a bundled texture into the cache the game reads, and refreshes a stale copy', async () => {
    const data = await mkdtemp(join(tmpdir(), 'shard-assets-'))
    dirs.push(data)
    const cosmetics = join(data, 'cosmetics')
    const assets = new CosmeticAssets({
      resourcesDir: resolve('resources'),
      paths: { cosmetics } as never
    })
    const dest = assets.cachePath(cape, 'texture')
    expect(dest).toBe(join(cosmetics, 'textures', 'cape-ohmarker.png'))

    await assets.ensureLocal(cape, 'texture')
    const bundled = await readFile(
      resolve('resources', 'cosmetics', 'textures', 'cape-ohmarker.png')
    )
    expect((await readFile(dest)).equals(bundled)).toBe(true)

    await mkdir(join(cosmetics, 'textures'), { recursive: true })
    await writeFile(dest, 'stale')
    await assets.ensureLocal(cape, 'texture')
    expect((await readFile(dest)).equals(bundled)).toBe(true)
  })
})
