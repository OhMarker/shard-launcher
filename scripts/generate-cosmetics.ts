/**
 * Generates the bundled sample cosmetics: resources/cosmetics/cosmetics.json plus placeholder
 * textures (64x32 cape layout for capes/cloaks/wings, 64x64 for worn items) and 256x256
 * preview cards. Deterministic, so re-running produces identical files.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PNG } from 'pngjs'

type Rgb = [number, number, number]

interface Sample {
  id: string
  type: 'cape' | 'cloak' | 'hat' | 'wings' | 'bandana' | 'backbling' | 'emote'
  name: string
  rarity: 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'
  colors: [Rgb, Rgb]
  pattern: 'facets' | 'stripes' | 'checker' | 'gradient' | 'rings'
  animated?: boolean
  description: string
  availability?: 'free' | 'locked'
  tags?: string[]
}

const SAMPLES: Sample[] = [
  { id: 'cape-crystal', type: 'cape', name: 'Crystal Cape', rarity: 'epic', colors: [[34, 211, 238], [8, 51, 68]], pattern: 'facets', description: 'The signature Shard cape. Faceted cyan over deep slate.', tags: ['launch'] },
  { id: 'cape-obsidian', type: 'cape', name: 'Obsidian Cape', rarity: 'rare', colors: [[46, 16, 101], [10, 6, 20]], pattern: 'gradient', description: 'Dark purple shimmer, like a freshly mined block.' },
  { id: 'cape-ender', type: 'cape', name: 'Ender Cape', rarity: 'legendary', colors: [[16, 185, 129], [2, 44, 34]], pattern: 'rings', animated: true, description: 'Pulsing teleport rings. Animated in-game.', availability: 'locked' },
  { id: 'cape-netherite', type: 'cape', name: 'Netherite Cape', rarity: 'epic', colors: [[120, 82, 60], [36, 24, 20]], pattern: 'checker', description: 'Ancient debris weave with gold flecks.' },
  { id: 'cape-totem', type: 'cape', name: 'Totem Cape', rarity: 'mythic', colors: [[250, 204, 21], [120, 53, 15]], pattern: 'facets', animated: true, description: 'Golden totem glow. Pops when you survive a crystal.', availability: 'locked' },
  { id: 'cloak-shard', type: 'cloak', name: 'Shard Cloak', rarity: 'rare', colors: [[103, 232, 249], [15, 23, 42]], pattern: 'stripes', description: 'A longer, flowing version of the Crystal Cape.' },
  { id: 'cloak-void', type: 'cloak', name: 'Void Cloak', rarity: 'legendary', colors: [[30, 27, 75], [0, 0, 0]], pattern: 'gradient', animated: true, description: 'Swallows light. Faint particles at the hem.', availability: 'locked' },
  { id: 'hat-crystal-crown', type: 'hat', name: 'Crystal Crown', rarity: 'legendary', colors: [[165, 243, 252], [34, 211, 238]], pattern: 'facets', description: 'Five floating shards orbiting your head.' },
  { id: 'hat-shard-halo', type: 'hat', name: 'Shard Halo', rarity: 'epic', colors: [[253, 230, 138], [217, 119, 6]], pattern: 'rings', animated: true, description: 'A slow-spinning ring of light.' },
  { id: 'wings-glass', type: 'wings', name: 'Glass Wings', rarity: 'epic', colors: [[224, 242, 254], [56, 189, 248]], pattern: 'facets', description: 'Translucent elytra-style wings.' },
  { id: 'wings-phantom', type: 'wings', name: 'Phantom Wings', rarity: 'mythic', colors: [[148, 163, 184], [15, 23, 42]], pattern: 'stripes', animated: true, description: 'Tattered phantom membrane. Flaps while sprinting.', availability: 'locked' },
  { id: 'bandana-cyan', type: 'bandana', name: 'Cyan Bandana', rarity: 'common', colors: [[34, 211, 238], [14, 116, 144]], pattern: 'checker', description: 'A simple cloth bandana in Shard cyan.' },
  { id: 'backbling-anchor', type: 'backbling', name: 'Anchor Pack', rarity: 'rare', colors: [[71, 85, 105], [226, 232, 240]], pattern: 'stripes', description: 'A respawn anchor strapped to your back.' },
  { id: 'emote-crystal-pop', type: 'emote', name: 'Crystal Pop', rarity: 'rare', colors: [[34, 211, 238], [255, 255, 255]], pattern: 'facets', animated: true, description: 'Summon and pop a crystal in one motion.' },
  { id: 'emote-gg', type: 'emote', name: 'GG', rarity: 'common', colors: [[52, 211, 153], [6, 78, 59]], pattern: 'gradient', animated: true, description: 'Good game. Say it with a bow.' }
]

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function shade(sample: Sample, u: number, v: number, seed: number): Rgb {
  const [a, b] = sample.colors
  switch (sample.pattern) {
    case 'gradient':
      return mix(a, b, v)
    case 'stripes':
      return Math.floor((u + v) * 6) % 2 === 0 ? a : mix(a, b, 0.7)
    case 'checker':
      return (Math.floor(u * 4) + Math.floor(v * 6)) % 2 === 0 ? a : b
    case 'rings': {
      const d = Math.hypot(u - 0.5, v - 0.5)
      return Math.floor(d * 8) % 2 === 0 ? a : b
    }
    case 'facets':
    default: {
      const cell = hash(Math.floor(u * 4), Math.floor(v * 6), seed)
      return mix(b, a, 0.25 + cell * 0.75)
    }
  }
}

function paint(png: PNG, x0: number, y0: number, w: number, h: number, sample: Sample, seed: number): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = shade(sample, x / w, y / h, seed)
      const idx = ((y0 + y) * png.width + (x0 + x)) * 4
      png.data[idx] = Math.round(r)
      png.data[idx + 1] = Math.round(g)
      png.data[idx + 2] = Math.round(b)
      png.data[idx + 3] = 255
    }
  }
}

/** 64x32 vanilla cape layout: cape faces around (1,1)..(21,17), elytra at (34,2)..(63,22). */
function capeTexture(sample: Sample, seed: number): Buffer {
  const png = new PNG({ width: 64, height: 32 })
  paint(png, 0, 0, 22, 17, sample, seed) // cape (all six faces)
  paint(png, 22, 0, 24, 22, sample, seed + 1) // elytra wings (left)
  paint(png, 34, 2, 30, 20, sample, seed + 2) // elytra
  return PNG.sync.write(png)
}

function squareTexture(sample: Sample, seed: number, size: number): Buffer {
  const png = new PNG({ width: size, height: size })
  paint(png, 0, 0, size, size, sample, seed)
  return PNG.sync.write(png)
}

function previewCard(sample: Sample, seed: number): Buffer {
  const size = 256
  const png = new PNG({ width: size, height: size })
  const [a, b] = sample.colors
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      // dark vignette background
      const d = Math.hypot(u - 0.5, v - 0.5)
      let col: Rgb = [11 + 8 * (1 - d), 15 + 10 * (1 - d), 24 + 14 * (1 - d)]
      // centred diamond showing the pattern
      const inDiamond = Math.abs(u - 0.5) + Math.abs(v - 0.5) < 0.32
      if (inDiamond) {
        col = shade(sample, (u - 0.18) / 0.64, (v - 0.18) / 0.64, seed)
        if (Math.abs(u - 0.5) + Math.abs(v - 0.5) > 0.3) col = mix(a, [255, 255, 255], 0.5)
      }
      const glow = Math.max(0, 0.38 - d) * 0.9
      col = mix(col, b, 0)
      col = [col[0] + a[0] * glow * 0.4, col[1] + a[1] * glow * 0.4, col[2] + a[2] * glow * 0.4]
      const idx = (y * size + x) * 4
      png.data[idx] = Math.min(255, Math.round(col[0]))
      png.data[idx + 1] = Math.min(255, Math.round(col[1]))
      png.data[idx + 2] = Math.min(255, Math.round(col[2]))
      png.data[idx + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

const root = process.cwd()
const outDir = join(root, 'resources', 'cosmetics')
const texDir = join(outDir, 'textures')
const prevDir = join(outDir, 'previews')
await mkdir(texDir, { recursive: true })
await mkdir(prevDir, { recursive: true })

const cosmetics = []
let seed = 7
for (const s of SAMPLES) {
  seed += 13
  const texName = `${s.id}.png`
  const prevName = `${s.id}.png`
  const isCapeLayout = s.type === 'cape' || s.type === 'cloak' || s.type === 'wings'
  await writeFile(join(texDir, texName), isCapeLayout ? capeTexture(s, seed) : squareTexture(s, seed, 64))
  await writeFile(join(prevDir, prevName), previewCard(s, seed))
  cosmetics.push({
    id: s.id,
    type: s.type,
    name: s.name,
    rarity: s.rarity,
    textureUrl: `bundled://cosmetics/textures/${texName}`,
    previewUrl: `bundled://cosmetics/previews/${prevName}`,
    animated: s.animated ?? false,
    author: 'Shard',
    description: s.description,
    availability: s.availability ?? 'free',
    tags: s.tags ?? []
  })
}

await writeFile(
  join(outDir, 'cosmetics.json'),
  JSON.stringify({ schemaVersion: 1, updatedAt: '2026-10-06T00:00:00Z', cosmetics }, null, 2) + '\n'
)
console.warn(`Wrote ${cosmetics.length} sample cosmetics to ${outDir}`)
