import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  BANDANA,
  bandanaQuads,
  bandanaSideHem,
  bandanaTopV,
  cuboidQuads,
  offhandShieldMatrix,
  shieldQuads,
  toBuffers,
  type Quad
} from '@/components/player/cosmetic-geometry'

const close = (a: number, b: number): boolean => Math.abs(a - b) < 1e-5

function bounds(quads: readonly Quad[]) {
  const all = quads.flatMap((q) => q.p)
  const axis = (i: number) => ({
    min: Math.min(...all.map((p) => p[i])),
    max: Math.max(...all.map((p) => p[i]))
  })
  return { x: axis(0), y: axis(1), z: axis(2) }
}

describe('bandana geometry (BandanaMesh port)', () => {
  const quads = bandanaQuads()

  it('has the same pieces as the in-game mesh', () => {
    // top 4x4, band 4x1, sides 2x10, back 4x2, knot 5, tails 2
    expect(quads).toHaveLength(16 + 4 + 20 + 8 + 5 + 2)
  })

  it('sits 0.6 px outside the head', () => {
    const shell = quads.slice(0, 48)
    const b = bounds(shell)
    expect(b.x.min).toBeCloseTo(-4.6)
    expect(b.x.max).toBeCloseTo(4.6)
    expect(b.y.min).toBeCloseTo(-8.6)
    expect(b.z.min).toBeCloseTo(-4.6)
    expect(b.z.max).toBeCloseTo(4.6)
  })

  it('keeps the forehead band above the eyes and drops behind the ears', () => {
    expect(bandanaSideHem(-BANDANA.E)).toBeCloseTo(BANDANA.FRONT_HEM)
    expect(bandanaSideHem(BANDANA.E)).toBeCloseTo(BANDANA.BACK_HEM)
    expect(BANDANA.FRONT_HEM).toBeLessThan(-4) // eyes are at y -4..-3
    expect(bandanaSideHem(0)).toBeCloseTo((BANDANA.FRONT_HEM + BANDANA.BACK_HEM) / 2)
  })

  it('cuts the art like the game: top centre, back lower half', () => {
    expect(bandanaTopV(BANDANA.E)).toBeCloseTo(BANDANA.TOP_V0)
    expect(bandanaTopV(-BANDANA.E)).toBeCloseTo(BANDANA.TOP_V1)
    const top = quads.slice(0, 16).flatMap((q) => q.uv)
    expect(Math.min(...top.map((t) => t[0]))).toBeCloseTo(0.125)
    expect(Math.max(...top.map((t) => t[1]))).toBeCloseTo(0.875)
    const back = quads.slice(40, 48).flatMap((q) => q.uv)
    expect(Math.min(...back.map((t) => t[1]))).toBeCloseTo(0.5)
    expect(Math.max(...back.map((t) => t[1]))).toBeCloseTo(0.988)
    for (const q of quads) for (const [u, v] of q.uv) expect(u >= 0 && u <= 1 && v >= 0 && v <= 1).toBe(true)
  })

  it('hangs the tails behind the head', () => {
    for (const tail of quads.slice(-2)) {
      expect(Math.min(...tail.p.map((p) => p[2]))).toBeGreaterThan(BANDANA.E)
      expect(tail.n[2]).toBeGreaterThan(0)
    }
  })
})

describe('shield geometry (vanilla ShieldModel)', () => {
  it('builds the plate and the handle', () => {
    const quads = shieldQuads()
    expect(quads).toHaveLength(12)
    const plate = bounds(quads.slice(0, 6))
    expect([plate.x.min, plate.x.max, plate.y.min, plate.y.max, plate.z.min, plate.z.max]).toEqual([-6, 6, -11, 11, -2, -1])
  })

  it('puts the art (box layout front at 1,1 .. 13,23) on the -z face', () => {
    const north = cuboidQuads(-6, -11, -2, 12, 22, 1, 0, 0, 64, 64).find((q) => q.n[2] === -1)!
    const us = north.uv.map((t) => t[0] * 64)
    const vs = north.uv.map((t) => t[1] * 64)
    expect([Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)]).toEqual([1, 13, 1, 23])
    // Upright: the top of the art (v 1) is at the top of the plate (model y -11).
    const topCorner = north.p.findIndex((p) => p[1] === -11)
    expect(north.uv[topCorner][1] * 64).toBe(1)
    // Not mirrored: seen from the front (from -z with y down, +x is on the viewer's right), u grows with x.
    const right = north.p.findIndex((p) => p[0] === 6 && p[1] === -11)
    expect(north.uv[right][0] * 64).toBe(13)
  })

  it('hangs upright along the outside of the left forearm, art facing out', () => {
    const m = offhandShieldMatrix()
    const b = toBuffers(shieldQuads())
    const pts: Vector3[] = []
    for (let i = 0; i < b.positions.length; i += 3) pts.push(new Vector3().fromArray(b.positions, i).applyMatrix4(m))
    const plate = pts.slice(0, 24) // the first six faces (four corners each) are the plate
    const span = (k: 'x' | 'y' | 'z') => {
      const v = plate.map((p) => p[k])
      return { min: Math.min(...v), max: Math.max(...v) }
    }
    // No arm in the plate: every corner of the arm's overlay box (x -1.25..3.25, y -10.25..2.25,
    // z -2.25..2.25) lies inwards of the plate's inner face.
    const n = new Vector3(0, 0, 1).transformDirection(m)
    const inner = Math.min(...plate.map((p) => p.dot(n)))
    for (const x of [-1.25, 3.25]) for (const y of [-10.25, 2.25]) for (const z of [-2.25, 2.25]) {
      expect(new Vector3(x, y, z).dot(n)).toBeLessThan(inner)
    }
    expect(span('z').max - span('z').min).toBeLessThanOrEqual(4 * 1.7)
    expect(span('x').max - span('x').min).toBeLessThan(2.5) // a slab beside the arm, not sticking out
    expect(span('y').max - span('y').min).toBeGreaterThan(11)
    expect(span('y').max - span('y').min).toBeLessThan(14)
    // Centred on the forearm (the arm spans y -10..2 and z -2..2).
    expect((span('y').min + span('y').max) / 2).toBeCloseTo(-6)
    expect(Math.abs((span('z').min + span('z').max) / 2)).toBeLessThan(0.5)
    // Art (+z in shield space) faces away from the body, a little towards the front; its top is up.
    const facing = new Vector3(0, 0, 1).transformDirection(m)
    expect(facing.x).toBeGreaterThan(0.95)
    expect(facing.z).toBeGreaterThan(0.1)
    expect(new Vector3(0, 1, 0).transformDirection(m).y).toBeCloseTo(1)
    // Unmirrored: seen from outside (+x, looking -x, so the viewer's right is -z), the art's right
    // edge (shield +x) is on the viewer's right.
    expect(new Vector3(1, 0, 0).transformDirection(m).z).toBeLessThan(-0.95)
    // The handle stays inside the arm (x -1..3) apart from the strap in the gap.
    const handle = pts.slice(24)
    expect(Math.min(...handle.map((p) => p.x))).toBeGreaterThan(-1)
  })
})

describe('toBuffers', () => {
  it('turns into skinview3d space, flips v and winds every face along its normal', () => {
    const quads = [...bandanaQuads(), ...shieldQuads()]
    const b = toBuffers(quads)
    expect(b.positions).toHaveLength(quads.length * 12)
    expect(b.indices).toHaveLength(quads.length * 6)
    expect(close(b.positions[1], -quads[0].p[0][1])).toBe(true)
    expect(close(b.uvs[1], 1 - quads[0].uv[0][1])).toBe(true)
    for (let t = 0; t < b.indices.length; t += 3) {
      const v = [0, 1, 2].map((k) => new Vector3().fromArray(b.positions, b.indices[t + k] * 3))
      const g = new Vector3().subVectors(v[1], v[0]).cross(new Vector3().subVectors(v[2], v[0]))
      const n = new Vector3().fromArray(b.normals, b.indices[t] * 3)
      expect(g.dot(n)).toBeGreaterThan(0)
    }
  })
})
