/**
 * Geometry for the cosmetics the 3D player preview wears besides the cape: the bandana on the
 * head and the shield in the off hand. Pure maths (three.js only for Matrix4), unit-tested.
 *
 * Quads are built in Minecraft model space, the same numbers Shard Client uses: model pixels,
 * y grows downwards and the face looks towards -z (player's left is +x). skinview3d's body parts
 * use y up and the face towards +z, which is a 180 degree turn about x: (x, y, z) -> (x, -y, -z).
 * {@link toBuffers} applies that turn and flips v for WebGL.
 */

import { Matrix4 } from 'three'

/** One textured quad: four corners (x, y, z), their art coordinates (u, v; 0..1, v downwards), and the outward normal. */
export interface Quad {
  p: [number, number, number][]
  uv: [number, number][]
  n: [number, number, number]
}

interface P {
  x: number
  y: number
  z: number
  u: number
  v: number
}

const pt = (x: number, y: number, z: number, u: number, v: number): P => ({ x, y, z, u, v })
const lerp = (a: P, b: P, t: number): P => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
  u: a.u + (b.u - a.u) * t,
  v: a.v + (b.v - a.v) * t
})

function quad(out: Quad[], a: P, b: P, c: P, d: P, nx: number, ny: number, nz: number): void {
  const ps = [a, b, c, d]
  out.push({ p: ps.map((q) => [q.x, q.y, q.z]), uv: ps.map((q) => [q.u, q.v]), n: [nx, ny, nz] })
}

/** A face from four corners (a b on the first edge, c d on the opposite one), split nu x nv. */
function grid(out: Quad[], a: P, b: P, c: P, d: P, nu: number, nv: number, nx: number, ny: number, nz: number): void {
  for (let j = 0; j < nv; j++) {
    const t0 = j / nv
    const t1 = (j + 1) / nv
    const l0 = lerp(a, c, t0)
    const r0 = lerp(b, d, t0)
    const l1 = lerp(a, c, t1)
    const r1 = lerp(b, d, t1)
    for (let i = 0; i < nu; i++) {
      const s0 = i / nu
      const s1 = (i + 1) / nu
      quad(out, lerp(l0, r0, s0), lerp(l0, r0, s1), lerp(l1, r1, s1), lerp(l1, r1, s0), nx, ny, nz)
    }
  }
}

// ---------------------------------------------------------------------------
// Bandana (port of shard-client BandanaMesh.java; keep the numbers in sync)
// ---------------------------------------------------------------------------

/**
 * Head space: the head cube spans x and z -4..4 and y -8..0 (the neck is the origin). The bandana
 * is a shell 0.6 px outside it (the hat layer is at 0.5): top, forehead band, sides reaching
 * behind the ears, back, and a knot with two tails. Any square art in the same structure works.
 */
export const BANDANA = {
  SHELL: 0.6,
  E: 4.6,
  TOP: -8.6,
  FRONT_HEM: -6.35,
  BACK_HEM: -3.2,
  TOP_U0: 0.125,
  TOP_U1: 0.875,
  TOP_V0: 0.125,
  TOP_V1: 0.875,
  BAND_V1: 0.988,
  BORDER_OUT: 0.012,
  BACK_U0: 0.1,
  BACK_U1: 0.9,
  BACK_V0: 0.5,
  BACK_V1: 0.988,
  KNOT_W: 2.2,
  KNOT_H: 1.7,
  KNOT_D: 1.0,
  KNOT_Y: -3.2 - 0.75,
  KNOT_U0: 0.3,
  KNOT_U1: 0.4,
  KNOT_V0: 0.15,
  KNOT_V1: 0.23,
  MEDAL_U0: 0.05,
  MEDAL_U1: 0.11,
  MEDAL_V0: 0.057,
  MEDAL_V1: 0.103,
  TAIL_LEN: 3.6,
  TAIL_W: 1.3,
  TAIL_SPLAY: 20,
  TAIL_LEAN: 22
} as const

/** Lower edge of the side at depth z: from the forehead band down to the back hem. */
export function bandanaSideHem(z: number): number {
  const { E, FRONT_HEM, BACK_HEM } = BANDANA
  let t = (z + E) / (2 * E)
  t = t * t * (3 - 2 * t)
  return FRONT_HEM + (BACK_HEM - FRONT_HEM) * t
}

/** Art v along the top (and the sides' upper edge) at depth z: back edge TOP_V0, front TOP_V1. */
export function bandanaTopV(z: number): number {
  const { E, TOP_V0, TOP_V1 } = BANDANA
  return TOP_V0 + ((TOP_V1 - TOP_V0) * (E - z)) / (2 * E)
}

export function bandanaQuads(): Quad[] {
  const B = BANDANA
  const { E, TOP } = B
  const out: Quad[] = []
  // Top. a = back-left (-x), b = back-right, c = front-left, d = front-right.
  grid(
    out,
    pt(-E, TOP, E, B.TOP_U0, B.TOP_V0),
    pt(E, TOP, E, B.TOP_U1, B.TOP_V0),
    pt(-E, TOP, -E, B.TOP_U0, B.TOP_V1),
    pt(E, TOP, -E, B.TOP_U1, B.TOP_V1),
    4,
    4,
    0,
    -1,
    0
  )
  // Forehead band.
  grid(
    out,
    pt(-E, TOP, -E, B.TOP_U0, B.TOP_V1),
    pt(E, TOP, -E, B.TOP_U1, B.TOP_V1),
    pt(-E, B.FRONT_HEM, -E, B.TOP_U0, B.BAND_V1),
    pt(E, B.FRONT_HEM, -E, B.TOP_U1, B.BAND_V1),
    4,
    1,
    0,
    0,
    -1
  )
  // Sides, in slices so the slanted hem keeps the border straight along it.
  const slices = 10
  for (let side = -1; side <= 1; side += 2) {
    const x = side * E
    const uIn = side < 0 ? B.TOP_U0 : B.TOP_U1
    const uOut = side < 0 ? B.BORDER_OUT : 1 - B.BORDER_OUT
    for (let i = 0; i < slices; i++) {
      const z0 = -E + (2 * E * i) / slices
      const z1 = -E + (2 * E * (i + 1)) / slices
      const a = pt(x, TOP, z0, uIn, bandanaTopV(z0))
      const b = pt(x, TOP, z1, uIn, bandanaTopV(z1))
      const c = pt(x, bandanaSideHem(z0), z0, uOut, bandanaTopV(z0))
      const d = pt(x, bandanaSideHem(z1), z1, uOut, bandanaTopV(z1))
      quad(out, a, b, d, c, side, 0, 0)
    }
  }
  // Back: upright for someone behind, whose left is the player's left (+x).
  grid(
    out,
    pt(E, TOP, E, B.BACK_U0, B.BACK_V0),
    pt(-E, TOP, E, B.BACK_U1, B.BACK_V0),
    pt(E, B.BACK_HEM, E, B.BACK_U0, B.BACK_V1),
    pt(-E, B.BACK_HEM, E, B.BACK_U1, B.BACK_V1),
    4,
    2,
    0,
    0,
    1
  )
  bandanaKnot(out)
  return out
}

function bandanaKnot(out: Quad[]): void {
  const B = BANDANA
  const { E } = B
  const x0 = -B.KNOT_W / 2
  const x1 = B.KNOT_W / 2
  const y0 = B.KNOT_Y - B.KNOT_H / 2
  const y1 = B.KNOT_Y + B.KNOT_H / 2
  const z0 = E - 0.05
  const z1 = E + B.KNOT_D
  const { KNOT_U0: ku0, KNOT_U1: ku1, KNOT_V0: kv0, KNOT_V1: kv1 } = B
  quad(out, pt(x1, y0, z1, B.MEDAL_U0, B.MEDAL_V0), pt(x0, y0, z1, B.MEDAL_U1, B.MEDAL_V0),
    pt(x0, y1, z1, B.MEDAL_U1, B.MEDAL_V1), pt(x1, y1, z1, B.MEDAL_U0, B.MEDAL_V1), 0, 0, 1)
  quad(out, pt(x0, y0, z0, ku0, kv0), pt(x1, y0, z0, ku1, kv0), pt(x1, y0, z1, ku1, kv1), pt(x0, y0, z1, ku0, kv1), 0, -1, 0)
  quad(out, pt(x0, y1, z1, ku0, kv0), pt(x1, y1, z1, ku1, kv0), pt(x1, y1, z0, ku1, kv1), pt(x0, y1, z0, ku0, kv1), 0, 1, 0)
  quad(out, pt(x0, y0, z0, ku0, kv0), pt(x0, y0, z1, ku1, kv0), pt(x0, y1, z1, ku1, kv1), pt(x0, y1, z0, ku0, kv1), -1, 0, 0)
  quad(out, pt(x1, y0, z1, ku0, kv0), pt(x1, y0, z0, ku1, kv0), pt(x1, y1, z0, ku1, kv1), pt(x1, y1, z1, ku0, kv1), 1, 0, 0)
  for (let side = -1; side <= 1; side += 2) {
    const splay = ((B.TAIL_SPLAY * Math.PI) / 180) * side
    const lean = (B.TAIL_LEAN * Math.PI) / 180
    const dx = Math.sin(splay) * Math.cos(lean)
    const dy = Math.cos(splay) * Math.cos(lean)
    const dz = Math.sin(lean)
    const ax = Math.cos(splay)
    const ay = -Math.sin(splay)
    const sx = side * B.KNOT_W * 0.22
    const sy = y1 - 0.2
    const sz = E + B.KNOT_D * 0.55
    const hw = B.TAIL_W / 2
    const ex = sx + dx * B.TAIL_LEN
    const ey = sy + dy * B.TAIL_LEN
    const ez = sz + dz * B.TAIL_LEN
    let nx = ay * dz
    let ny = -ax * dz
    let nz = ax * dy - ay * dx
    const len = Math.hypot(nx, ny, nz)
    nx /= len
    ny /= len
    nz /= len
    if (nz < 0) {
      nx = -nx
      ny = -ny
      nz = -nz
    }
    const u0 = side < 0 ? B.BORDER_OUT : B.TOP_U1
    const u1 = side < 0 ? B.TOP_U0 : 1 - B.BORDER_OUT
    quad(out, pt(sx - ax * hw, sy - ay * hw, sz, u0, 0.3), pt(sx + ax * hw, sy + ay * hw, sz, u1, 0.3),
      pt(ex + ax * hw, ey + ay * hw, ez, u1, 0.7), pt(ex - ax * hw, ey - ay * hw, ez, u0, 0.7), nx, ny, nz)
  }
}

// ---------------------------------------------------------------------------
// Shield (vanilla ShieldModel)
// ---------------------------------------------------------------------------

/**
 * A Minecraft model cuboid (ModelPart.Cuboid, not mirrored): box from (x, y, z) of size w x h x d,
 * its six faces cut from the standard box layout at (u, v) of a texW x texH texture grid.
 */
export function cuboidQuads(
  x: number, y: number, z: number,
  w: number, h: number, d: number,
  u: number, v: number,
  texW: number, texH: number
): Quad[] {
  const f = x, g = y, hh = z, i = x + w, j = y + h, k = z + d
  const v1: [number, number, number] = [f, g, hh]
  const v2: [number, number, number] = [i, g, hh]
  const v3: [number, number, number] = [i, j, hh]
  const v4: [number, number, number] = [f, j, hh]
  const v5: [number, number, number] = [f, g, k]
  const v6: [number, number, number] = [i, g, k]
  const v7: [number, number, number] = [i, j, k]
  const v8: [number, number, number] = [f, j, k]
  const l = u, m = u + d, n = u + d + w, o = u + d + w + w, p = u + d + w + d, q = u + d + w + d + w
  const r = v, s = v + d, t = v + d + h
  const out: Quad[] = []
  const face = (vs: [number, number, number][], u1: number, vv1: number, u2: number, vv2: number, nrm: [number, number, number]): void => {
    // Polygon: corner 0 -> (u2, v1), 1 -> (u1, v1), 2 -> (u1, v2), 3 -> (u2, v2).
    const uv: [number, number][] = [
      [u2 / texW, vv1 / texH],
      [u1 / texW, vv1 / texH],
      [u1 / texW, vv2 / texH],
      [u2 / texW, vv2 / texH]
    ]
    out.push({ p: vs, uv, n: nrm })
  }
  face([v6, v5, v1, v2], m, r, n, s, [0, -1, 0]) // down (model y-, the visual top)
  face([v3, v4, v8, v7], n, s, o, r, [0, 1, 0]) // up
  face([v1, v5, v8, v4], l, s, m, t, [-1, 0, 0]) // west
  face([v2, v1, v4, v3], m, s, n, t, [0, 0, -1]) // north: the shield's art
  face([v6, v2, v3, v7], n, s, p, t, [1, 0, 0]) // east
  face([v5, v6, v7, v8], p, s, q, t, [0, 0, 1]) // south
  return out
}

/** Vanilla ShieldModel: plate 12x22x1 at uv(0,0), handle 2x6x6 at uv(26,0), 64x64 grid. */
export function shieldQuads(): Quad[] {
  return [
    ...cuboidQuads(-6, -11, -2, 12, 22, 1, 0, 0, 64, 64),
    ...cuboidQuads(-1, -3, -1, 2, 6, 6, 26, 0, 64, 64)
  ]
}

/** Shield size on the preview model, relative to vanilla: about torso height (22 px -> ~12). */
export const SHIELD_SCALE = 0.55
/** The left arm's skin overlay in arm space: x up to 3.25 and z -2.25..2.25 (wide arms). */
export const ARM_OUTER_X = 3.25
export const ARM_HALF_DEPTH = 2.25
/** Gap kept between the overlay and the plate. */
export const SHIELD_CLEARANCE = 0.1
/** Height of the plate's centre in arm space: around the forearm (the arm spans y -10..2). */
export const SHIELD_CENTRE_Y = -6
/** Turned this far towards the front so a front view still sees some of the art. */
export const SHIELD_YAW = 12

/**
 * Where the preview puts the shield, in skinview3d's left-arm space (pivot at the shoulder, y up,
 * face towards +z), for geometry built by shieldQuads + toBuffers.
 *
 * Not vanilla's held pose (that one is huge and lies sideways, reading badly in a shop): the
 * shield hangs upright along the outside of the forearm, as if strapped to it. Turned about y so
 * the art (+z) faces away from the body (+x), {@link SHIELD_YAW} degrees towards the front, top
 * up and unmirrored; scaled to {@link SHIELD_SCALE}; pushed out until the plate's inner face clears
 * the arm's front corner. The handle then sits inside the arm, peeking out only as a strap.
 */
export function offhandShieldMatrix(): Matrix4 {
  const plateInnerZ = 1 // the plate spans z 1..2 after the (x, -y, -z) turn
  const yaw = (SHIELD_YAW * Math.PI) / 180
  // The inner face is a line through (innerX, 0) leaning inwards towards +z by tan(yaw); it must
  // pass outside the overlay's front-outer corner (ARM_OUTER_X, ARM_HALF_DEPTH).
  const innerX = ARM_OUTER_X + SHIELD_CLEARANCE + ARM_HALF_DEPTH * Math.tan(yaw)
  // The shield origin (handle side) sits inwards of the plate by its scaled depth.
  const centreX = innerX - (plateInnerZ * SHIELD_SCALE) / Math.cos(yaw)
  return new Matrix4()
    .makeTranslation(centreX, SHIELD_CENTRE_Y, 0)
    .multiply(new Matrix4().makeRotationY(Math.PI / 2 - yaw))
    .multiply(new Matrix4().makeScale(SHIELD_SCALE, SHIELD_SCALE, SHIELD_SCALE))
}

// ---------------------------------------------------------------------------
// Buffers for three.js
// ---------------------------------------------------------------------------

export interface MeshBuffers {
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  indices: Uint16Array
}

/**
 * Converts Minecraft-space quads to skinview3d space ((x, -y, -z), v flipped) as indexed
 * triangles. Each quad's winding is chosen so its front face points along its normal.
 */
export function toBuffers(quads: readonly Quad[]): MeshBuffers {
  const positions = new Float32Array(quads.length * 12)
  const normals = new Float32Array(quads.length * 12)
  const uvs = new Float32Array(quads.length * 8)
  const indices = new Uint16Array(quads.length * 6)
  quads.forEach((q, qi) => {
    const pts = q.p.map(([x, y, z]) => [x, -y, -z] as const)
    const nrm = [q.n[0], -q.n[1], -q.n[2]] as const
    for (let c = 0; c < 4; c++) {
      positions.set(pts[c], qi * 12 + c * 3)
      normals.set(nrm, qi * 12 + c * 3)
      uvs.set([q.uv[c][0], 1 - q.uv[c][1]], qi * 8 + c * 2)
    }
    // Geometric normal of corners 0,1,2 (counter-clockwise = front in WebGL).
    const [a, b, c] = pts
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const gx = e1[1] * e2[2] - e1[2] * e2[1]
    const gy = e1[2] * e2[0] - e1[0] * e2[2]
    const gz = e1[0] * e2[1] - e1[1] * e2[0]
    const ccw = gx * nrm[0] + gy * nrm[1] + gz * nrm[2] >= 0
    const base = qi * 4
    indices.set(
      ccw
        ? [base, base + 1, base + 2, base, base + 2, base + 3]
        : [base, base + 2, base + 1, base, base + 3, base + 2],
      qi * 6
    )
  })
  return { positions, normals, uvs, indices }
}
