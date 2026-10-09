import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  FrontSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  Texture
} from 'three'
import { bandanaQuads, offhandShieldMatrix, shieldQuads, toBuffers, type Quad } from './cosmetic-geometry'

/**
 * three.js objects for the bandana and the off-hand shield. They are added as children of
 * skinview3d's head and left arm, so they follow every animation those parts play.
 */

function geometryOf(quads: readonly Quad[]): BufferGeometry {
  const b = toBuffers(quads)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(b.positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(b.normals, 3))
  geometry.setAttribute('uv', new BufferAttribute(b.uvs, 2))
  geometry.setIndex(new BufferAttribute(b.indices, 1))
  return geometry
}

export interface CosmeticMesh {
  mesh: Mesh<BufferGeometry, MeshStandardMaterial>
  dispose(): void
}

function makeMesh(quads: readonly Quad[], doubleSided: boolean): CosmeticMesh {
  const material = new MeshStandardMaterial({
    side: doubleSided ? DoubleSide : FrontSide,
    transparent: true,
    alphaTest: 0.05
  })
  const mesh = new Mesh(geometryOf(quads), material)
  mesh.visible = false
  return {
    mesh,
    dispose() {
      material.map?.dispose()
      material.dispose()
      mesh.geometry.dispose()
      mesh.removeFromParent()
    }
  }
}

/** Bandana shell; add to `playerObject.skin.head`. Double-sided so the tails show from both sides. */
export function createBandana(): CosmeticMesh {
  const bandana = makeMesh(bandanaQuads(), true)
  bandana.mesh.name = 'bandana'
  return bandana
}

/** Shield; add to `playerObject.skin.leftArm`. */
export function createShield(): CosmeticMesh {
  const shield = makeMesh(shieldQuads(), false)
  shield.mesh.name = 'shield'
  shield.mesh.matrixAutoUpdate = false
  shield.mesh.matrix.copy(offhandShieldMatrix())
  return shield
}

/**
 * Puts a texture on a cosmetic mesh and shows it; null hides it. High-resolution art (the shop's
 * textures are 2048 px) gets trilinear mipmaps and anisotropy so it does not shimmer when drawn
 * small; 64 px pixel art keeps nearest filtering.
 */
export function applyCosmeticTexture(
  target: CosmeticMesh,
  image: HTMLImageElement | HTMLCanvasElement | null,
  maxAnisotropy: number
): void {
  const material = target.mesh.material
  material.map?.dispose()
  material.map = null
  target.mesh.visible = false
  if (image) {
    const texture = new Texture(image)
    if (image.width > 64) {
      texture.magFilter = LinearFilter
      texture.minFilter = LinearMipmapLinearFilter
      texture.generateMipmaps = true
      texture.anisotropy = maxAnisotropy
    } else {
      texture.magFilter = NearestFilter
      texture.minFilter = NearestFilter
      texture.generateMipmaps = false
    }
    texture.needsUpdate = true
    material.map = texture
    target.mesh.visible = true
  }
  material.needsUpdate = true
}

/** Loads an image from a data/https URL. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load ${url.slice(0, 64)}`))
    img.src = url
  })
}
