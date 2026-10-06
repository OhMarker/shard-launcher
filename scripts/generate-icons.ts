/**
 * Rasterises resources/icon.svg into every icon the app and electron-builder need.
 *   build/icon.png        1024x1024  (electron-builder derives .ico/.icns from this)
 *   build/icons/<n>.png   16..512    (Linux)
 *   resources/icon.png    512        (runtime: about dialog, notifications)
 *   resources/icon.ico    multi-size (runtime: Windows tray)
 *   resources/tray.png    64         (runtime: macOS/Linux tray)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const root = process.cwd()
const svg = await readFile(join(root, 'resources', 'icon.svg'), 'utf8')

function render(size: number): Buffer {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
  return Buffer.from(resvg.render().asPng())
}

/** Builds an ICO container holding PNG-compressed images (valid since Windows Vista). */
function buildIco(images: Array<{ size: number; png: Buffer }>): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const dirSize = 16 * images.length
  let offset = 6 + dirSize
  const entries: Buffer[] = []
  for (const img of images) {
    const e = Buffer.alloc(16)
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 0)
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 1)
    e.writeUInt8(0, 2)
    e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(img.png.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += img.png.length
    entries.push(e)
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)])
}

await mkdir(join(root, 'build', 'icons'), { recursive: true })

await writeFile(join(root, 'build', 'icon.png'), render(1024))
for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
  await writeFile(join(root, 'build', 'icons', `${size}x${size}.png`), render(size))
}
await writeFile(join(root, 'resources', 'icon.png'), render(512))
await writeFile(join(root, 'resources', 'tray.png'), render(64))
await writeFile(
  join(root, 'resources', 'icon.ico'),
  buildIco([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: render(size) })))
)

console.warn('Icons generated.')
