"""Builds the second cosmetics drop for the meta repository: three capes (Shard, Moonlit Tide,
Halloween), the Halloween shield and bandana, and their shop previews.

    python scripts/build-capes-2.py [meta-repo]      (default: ../meta next to this repo)

Needs Pillow, NumPy and SciPy. Sources are in art/capes-2/:

  shard-cape-source.webp      2000x1000 cape in Minecraft's 64x32 layout (31.25 px per texel)
  halloween-cape-source.webp  same layout
  ocean-cape-source.png       only the framed front art (560x848, frame 480x768 = 10:16)
  inter-semibold.ttf          Inter (SIL OFL, see LICENSE-Inter.txt) for the lettering

Outputs (cosmetics/textures and cosmetics/previews in the meta repo):

  cape-shard, cape-halloween  the layout files upscaled to 4096x2048 (64 px per texel).
  cape-ocean                  a full cape layout built around the front art: the frame on the
                              outer face, a dimmed and softened mirrored sea on the inner face,
                              light-blue edges, and moon-and-waves crops on both elytra faces.
  shield-halloween            2048x2048 in the vanilla shield layout (32 px per texel): front =
                              the jack-o'-lantern under the moon, back = the night sky and moon,
                              both in a dark iron frame with glowing orange rivets.
  bandana-halloween           2048x2048 square laid out like bandana-ohmarker (see the client's
                              BandanaMesh: top = inside the border band, the band wraps the head,
                              corner medallion = knot, side band = tails), drawn here with the
                              pumpkin and moon cut from the Halloween cape.
  previews                    cape fronts (portrait, 720 tall), the shield's front plate, the
                              bandana turned 45 degrees, and the 1280x720 Halloween bundle banner.
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "art" / "capes-2"
META = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "meta"
TEX = META / "cosmetics" / "textures"
PREV = META / "cosmetics" / "previews"
FONT = str(ART / "inter-semibold.ttf")
LZ = Image.LANCZOS
RNG = np.random.default_rng(31)

ORANGE = (255, 138, 36)
ORANGE_HOT = (255, 196, 110)
CREAM = (255, 232, 196)


# ---------------------------------------------------------------- helpers
def blank(size, color=(0, 0, 0, 0)):
    return Image.new("RGBA", size, color)


def to_f(im):
    return np.asarray(im.convert("RGB"), np.float32) / 255.0


def from_f(arr, mode="RGB"):
    return Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), mode)


def over(base, layer):
    """Alpha-composites an RGBA layer onto a float RGB array in place."""
    a = np.asarray(layer, np.float32) / 255.0
    base *= 1 - a[..., 3:]
    base += a[..., :3] * a[..., 3:]


def add_glow(base, mask, color, radius, strength):
    """Adds a soft glow of `color` around an L mask (additive, like light)."""
    m = np.asarray(mask.filter(ImageFilter.GaussianBlur(radius)), np.float32)[..., None] / 255.0
    base += m * (np.array(color, np.float32) / 255.0) * strength


def paint(base, mask, color, opacity=1.0):
    """Paints a solid colour through an L mask."""
    m = np.asarray(mask, np.float32)[..., None] / 255.0 * opacity
    base *= 1 - m
    base += m * (np.array(color, np.float32) / 255.0)


def down(im, size):
    return im.resize(size, LZ)


def radial(size, center, radius, inner, outer, power=1.0):
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt((xx - center[0]) ** 2 + (yy - center[1]) ** 2) / radius
    t = np.clip(d, 0, 1) ** power
    a, b = np.array(inner, np.float32) / 255, np.array(outer, np.float32) / 255
    return a * (1 - t[..., None]) + b * t[..., None]


def stars(size, count, rmin, rmax, seed, bright=1.0, ss=3):
    """An L mask of round stars of varying size and brightness."""
    rng = np.random.default_rng(seed)
    w, h = size
    big = Image.new("L", (w * ss, h * ss), 0)
    d = ImageDraw.Draw(big)
    for _ in range(count):
        x, y = rng.uniform(0, w * ss), rng.uniform(0, h * ss)
        r = rng.uniform(rmin, rmax) ** 1.0 * ss
        v = int(255 * bright * rng.uniform(0.35, 1.0))
        d.ellipse((x - r, y - r, x + r, y + r), fill=v)
    return down(big, size)


def sparkle(draw, cx, cy, r, fill, thin=0.18):
    """A four-pointed star."""
    pts = []
    for i in range(8):
        ang = math.pi / 4 * i - math.pi / 2
        rr = r if i % 2 == 0 else r * thin
        pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang)))
    draw.polygon(pts, fill=fill)


def unsharp(im, radius=2, percent=40, threshold=2):
    return im.filter(ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=threshold))


def save(im, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, optimize=True)
    print("wrote", path.relative_to(META), im.size)


# ---------------------------------------------------------------- capes
CAPE_S = 64  # output px per texel (4096x2048)


def cape_from_layout(name):
    """Upscales a finished 2000x1000 cape layout to 4096x2048 (Pillow premultiplies RGBA)."""
    im = Image.open(ART / name).convert("RGBA")
    big = im.resize((64 * CAPE_S, 32 * CAPE_S), LZ)
    rgb = unsharp(big.convert("RGB"), 2.5, 35, 2)
    out = rgb.convert("RGBA")
    out.putalpha(big.getchannel("A").point(lambda v: 255 if v > 127 else 0))
    return out


def cape_front_preview(cape):
    s = CAPE_S
    front = cape.crop((s, s, 11 * s, 17 * s)).convert("RGB")
    return front.resize((450, 720), LZ)


def tex_box(tx, ty, tw, th, s):
    return (tx * s, ty * s, (tx + tw) * s, (ty + th) * s)


def frame_gradient(w, h, top, bottom):
    t = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    a, b = np.array(top, np.float32) / 255, np.array(bottom, np.float32) / 255
    return from_f(np.broadcast_to(a * (1 - t) + b * t, (h, w, 3)).copy())


def build_ocean_cape():
    s = CAPE_S
    src = Image.open(ART / "ocean-cape-source.png").convert("RGB")
    framed = src.crop((40, 40, 520, 808))  # the light-blue frame and everything inside, 10:16
    inner = src.crop((50, 50, 510, 798))  # the art without the frame
    out = blank((64 * s, 32 * s))

    # Outer face (1,1) 10x16: the art itself.
    front = unsharp(framed.resize((10 * s, 16 * s), LZ), 2, 45, 2)
    out.paste(front, (s, s))

    # Inner face (12,1): the same sea, mirrored, softened and dimmed to a calm night, in a
    # darker frame.
    calm = inner.transpose(Image.FLIP_LEFT_RIGHT).resize((10 * s - 32, 16 * s - 32), LZ)
    soft = calm.filter(ImageFilter.GaussianBlur(10))
    calm_f = to_f(calm) * 0.35 + to_f(soft) * 0.65
    lum = calm_f.mean(axis=2, keepdims=True)
    calm_f = (calm_f * 0.75 + lum * 0.25) * np.array([0.52, 0.58, 0.72], np.float32)
    back = Image.new("RGB", (10 * s, 16 * s))
    back.paste(frame_gradient(10 * s, 16 * s, (92, 150, 170), (66, 120, 146)))
    ImageDraw.Draw(back).rectangle((10, 10, 10 * s - 11, 16 * s - 11), fill=(4, 20, 46))
    back.paste(from_f(calm_f), (16, 16))
    out.paste(back, (12 * s, s))

    # Edges in the frame's light blue (lighter at the top, as in the art).
    light_top, light_bottom = (171, 239, 251), (121, 204, 230)
    out.paste(frame_gradient(10 * s, s, light_top, light_top), (s, 0))  # top
    out.paste(frame_gradient(10 * s, s, light_bottom, light_bottom), (11 * s, 0))  # bottom
    side = frame_gradient(s, 16 * s, light_top, light_bottom)
    out.paste(side, (0, s))
    out.paste(side, (11 * s, s))

    # Elytra (22,0) 24x22: a dim sea-and-sky fill, both wing faces a moon-and-waves crop (10x20),
    # wing edges light blue.
    fill = inner.resize((24 * s, 22 * s), LZ).filter(ImageFilter.GaussianBlur(24))
    out.paste(from_f(to_f(fill) * 0.8), (22 * s, 0))
    # Mirrored so the moon sits towards each wing's outer edge rather than both by the spine.
    wing = inner.crop((86, 0, 460, 748)).transpose(Image.FLIP_LEFT_RIGHT).resize((10 * s, 20 * s), LZ)
    wing = unsharp(wing, 2, 40, 2)
    out.paste(wing, (24 * s, 2 * s))
    out.paste(wing.transpose(Image.FLIP_LEFT_RIGHT), (36 * s, 2 * s))
    # Wing edges in a deep sea blue: the 2-texel-thick sides are seen next to the body.
    edge = frame_gradient(2 * s, 20 * s, (40, 96, 146), (12, 40, 86))
    out.paste(edge, (22 * s, 2 * s))
    out.paste(edge, (34 * s, 2 * s))
    out.paste(frame_gradient(10 * s, 2 * s, (40, 96, 146), (40, 96, 146)), (24 * s, 0))
    out.paste(frame_gradient(10 * s, 2 * s, (12, 40, 86), (12, 40, 86)), (34 * s, 0))
    return out


# ---------------------------------------------------------------- Halloween art pieces
HALLOWEEN = Image.open(ART / "halloween-cape-source.webp").convert("RGB")
H_MOON = (187, 166, 92)  # centre and radius of the moon on the cape front (source px)


def fill_holes(rgb, holes, sigma=3.0, ignore=None):
    """Paints over `holes` (bool mask) from the surrounding pixels (normalised convolution),
    never sampling the `ignore` pixels."""
    known = (~holes if ignore is None else ~(holes | ignore)).astype(np.float32)
    out = rgb.copy()
    for s in (sigma * 4, sigma * 2, sigma):
        num = np.stack([ndimage.gaussian_filter(out[..., c] * known, s) for c in range(3)], axis=-1)
        den = ndimage.gaussian_filter(known, s)[..., None]
        est = num / np.maximum(den, 1e-6)
        ok = holes[..., None] & (den > (1e-3 if s == sigma * 4 else 0.25))
        out = np.where(ok, est, out)
    return out


def pumpkin_cutout():
    """The jack-o'-lantern from the cape front with a soft mask (RGBA, source resolution). The
    bare tree behind it crosses its right shoulder; those pixels are painted over."""
    box = (58, 246, 318, 492)
    crop = HALLOWEEN.crop(box)
    hsv = np.asarray(crop.convert("HSV"), np.float32) / 255.0
    h, sat, v = hsv[..., 0] * 360, hsv[..., 1], hsv[..., 2]
    orange = (h >= 5) & (h <= 62) & (sat > 0.5) & (v > 0.07)
    stem = (h > 58) & (h < 130) & (sat > 0.25) & (v > 0.18)
    m = orange | stem
    m[226:] = False  # the grass line; the pumpkin's foot is redrawn as a soft shadow instead
    m = ndimage.binary_opening(m, iterations=1)
    lab, n = ndimage.label(m)
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    m = lab == (1 + int(np.argmax(sizes)))
    m = ndimage.binary_closing(m, structure=np.ones((3, 3)), iterations=6)
    m = ndimage.binary_fill_holes(m)
    m[226:] = False
    rgb = np.asarray(crop, np.float32) / 255.0
    rgb8 = np.asarray(crop, np.int16)
    bluish = rgb8[..., 2] > rgb8[..., 1] - 6
    holes = m & (bluish | (~(orange | stem) & (v < 0.4)))  # tree and sky, not the lit face
    holes = ndimage.binary_dilation(holes, iterations=1) & m
    rgb = fill_holes(rgb, holes, 2.0)
    # A rounded foot instead of the grass line, then a smooth edge.
    yy, xx = np.mgrid[0 : m.shape[0], 0 : m.shape[1]].astype(np.float32)
    cols = np.where(m.any(axis=0))[0]
    cx, hw = (cols[0] + cols[-1]) / 2, (cols[-1] - cols[0]) / 2 + 1
    foot = 150 + 80 * np.clip(1 - np.abs((xx - cx) / hw) ** 4, 0, 1) ** 0.25
    m = m | (orange & (yy < foot) & (yy < 231) & (np.abs(xx - cx) < hw))
    m &= yy < foot
    m = ndimage.binary_fill_holes(m)
    sm = ndimage.gaussian_filter(m.astype(np.float32), 1.6) > 0.5
    sm = ndimage.binary_erosion(sm, iterations=1)
    mask = Image.fromarray((sm * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))
    out = from_f(rgb).convert("RGBA")
    out.putalpha(mask)
    return out


def moon_cutout(r_out=104):
    """The full moon (with its bats) from the cape front, feathered at its rim. The tree branch
    reaching over its lower left is painted over."""
    cx, cy, r = H_MOON
    box = (cx - r_out, cy - r_out, cx + r_out, cy + r_out)
    crop = HALLOWEEN.crop(box)
    rgb = np.asarray(crop, np.float32) / 255.0
    yy, xx = np.mgrid[0 : 2 * r_out, 0 : 2 * r_out].astype(np.float32)
    d = np.sqrt((xx - r_out + 0.5) ** 2 + (yy - r_out + 0.5) ** 2)
    lum = rgb.mean(axis=2)
    local = ndimage.median_filter(lum, 21)
    branch = ((lum < local - 0.05) | (lum < 0.5)) & (d < r - 1) & (xx < r_out - 6) & (yy > r_out - 10)
    branch = ndimage.binary_dilation(branch, iterations=2) & (d < r + 1)
    rgb = fill_holes(rgb, branch, 2.0, ignore=d > r - 2)
    out = from_f(rgb).convert("RGBA")
    a = np.clip((r + 1.5 - d) / 3.0, 0, 1)
    out.putalpha(Image.fromarray((a * 255).astype(np.uint8)))
    return out


def bat_points(cx, cy, s, flip=False):
    """Bat silhouette polygon (wings spread), centred on cx, cy, wingspan 2*s."""
    right = [(0.05, -0.16), (0.22, -0.34), (0.48, -0.47), (0.74, -0.46), (1.0, -0.26)]
    scallops = [(1.0, -0.26), (0.78, -0.08), (0.56, -0.02), (0.36, 0.10), (0.12, 0.12)]
    pts = list(right)
    for (x0, y0), (x1, y1) in zip(scallops, scallops[1:]):
        # A concave arc between two scallop tips.
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2 - 0.13
        for i in range(1, 9):
            t = i / 8
            pts.append(((1 - t) ** 2 * x0 + 2 * (1 - t) * t * mx + t * t * x1,
                        (1 - t) ** 2 * y0 + 2 * (1 - t) * t * my + t * t * y1))
    body = [(0.1, 0.18), (0.0, 0.25), (-0.1, 0.18)]
    left = [(-x, y) for x, y in reversed(pts)]
    head = [(-0.07, -0.18), (-0.1, -0.36), (-0.03, -0.25), (0.03, -0.25), (0.1, -0.36), (0.07, -0.18)]
    poly = pts + body + left + head
    sign = -1 if flip else 1
    return [(cx + sign * x * s, cy + y * s) for x, y in poly]


def pumpkin_icon(size):
    """A small carved pumpkin icon (RGBA, size x size), drawn 4x and reduced."""
    k = 4
    n = size * k
    u = n / 2.0

    def pt(x, y):
        return (u + x * u, u + y * u)

    def box(cx, cy, rx, ry):
        return (*pt(cx - rx, cy - ry), *pt(cx + rx, cy + ry))

    im = blank((n, n))
    d = ImageDraw.Draw(im)
    d.polygon([pt(-0.09, -0.5), pt(0.11, -0.5), pt(0.22, -0.9), pt(0.04, -0.94)], fill=(96, 74, 30, 255))
    d.ellipse(box(0, 0.12, 0.94, 0.74), fill=(214, 96, 16, 255))
    d.ellipse(box(0, 0.12, 0.62, 0.74), fill=(238, 120, 24, 255))
    d.ellipse(box(0, 0.12, 0.26, 0.74), fill=(250, 140, 34, 255))
    rib = (176, 70, 10, 255)
    w = max(1, int(0.045 * u))
    d.arc(box(0, 0.12, 0.62, 0.74), 0, 360, fill=rib, width=w)
    d.arc(box(0, 0.12, 0.26, 0.74), 0, 360, fill=rib, width=w)
    hl = blank((n, n))
    ImageDraw.Draw(hl).ellipse(box(-0.3, -0.18, 0.16, 0.26), fill=(255, 200, 120, 255))
    hl = hl.filter(ImageFilter.GaussianBlur(0.08 * u))
    hl.putalpha(hl.getchannel("A").point(lambda v: v * 0.45))
    im.alpha_composite(hl)
    face = blank((n, n))
    fd = ImageDraw.Draw(face)
    glow = (255, 216, 112, 255)
    fd.polygon([pt(-0.50, 0.08), pt(-0.16, 0.08), pt(-0.33, -0.2)], fill=glow)
    fd.polygon([pt(0.50, 0.08), pt(0.16, 0.08), pt(0.33, -0.2)], fill=glow)
    mouth = [(-0.58, 0.28), (-0.26, 0.36), (-0.2, 0.28), (-0.08, 0.36), (0.08, 0.36), (0.2, 0.28), (0.26, 0.36),
             (0.58, 0.28), (0.42, 0.56), (0.12, 0.64), (0.06, 0.56), (-0.06, 0.56), (-0.12, 0.64), (-0.42, 0.56)]
    fd.polygon([pt(x, y) for x, y in mouth], fill=glow)
    # A dark carved rim around the face so it reads at small sizes.
    rim = face.getchannel("A").filter(ImageFilter.MaxFilter(2 * max(1, int(0.03 * u)) + 1))
    dark = Image.new("RGBA", (n, n), (110, 36, 6, 255))
    dark.putalpha(rim)
    im.alpha_composite(dark)
    im.alpha_composite(face)
    return im.resize((size, size), LZ)


def bat_mask(size, flip=False):
    k = 4
    n = size * k
    m = Image.new("L", (n, n), 0)
    ImageDraw.Draw(m).polygon(bat_points(n / 2, n / 2 + 0.06 * n, n / 2 * 0.96, flip), fill=255)
    return m.resize((size, size), LZ)


def crescent_mask(size, angle_deg, thickness=0.42):
    """A crescent moon in a size x size mask; angle points from the moon's centre to the bite."""
    k = 4
    n = size * k
    r = n * 0.46
    c = n / 2
    m = Image.new("L", (n, n), 0)
    ImageDraw.Draw(m).ellipse((c - r, c - r, c + r, c + r), fill=255)
    a = math.radians(angle_deg)
    ox, oy = c + math.cos(a) * r * thickness, c + math.sin(a) * r * thickness
    bite = Image.new("L", (n, n), 0)
    ImageDraw.Draw(bite).ellipse((ox - r * 0.86, oy - r * 0.86, ox + r * 0.86, oy + r * 0.86), fill=255)
    m = ImageChops.subtract(m, bite)
    return m.resize((size, size), LZ)


def glyph_mask(ch, font):
    l, t, r, b = font.getbbox(ch, anchor="mm")
    w, h = int(r - l) + 8, int(b - t) + 8
    side = max(w, h) * 2
    m = Image.new("L", (side, side), 0)
    ImageDraw.Draw(m).text((side / 2, side / 2), ch, font=font, fill=255, anchor="mm")
    return m


def arc_text(mask, text, cx, cy, r, font, tracking, bottom=False):
    """Writes text along a circle into an L mask: over the top (clockwise) or under the bottom
    (left to right, letters upright)."""
    widths = [font.getlength(ch) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    ang = -total / 2 / r
    for ch, w in zip(text, widths):
        mid = ang + w / 2 / r
        g = glyph_mask(ch, font)
        if bottom:
            x, y = cx + r * math.sin(mid), cy + r * math.cos(mid)
            g = g.rotate(math.degrees(mid), resample=Image.BICUBIC)
        else:
            x, y = cx + r * math.sin(mid), cy - r * math.cos(mid)
            g = g.rotate(-math.degrees(mid), resample=Image.BICUBIC)
        mask.paste(ImageChops.lighter(mask.crop((int(x - g.width / 2), int(y - g.height / 2),
                                                 int(x - g.width / 2) + g.width, int(y - g.height / 2) + g.height)), g),
                   (int(x - g.width / 2), int(y - g.height / 2)))
        ang += (w + tracking) / r


# ---------------------------------------------------------------- shield
SH = 32  # px per texel (2048x2048)


def iron(w, h, seed, base=(48, 39, 62)):
    """Dark purple-tinted iron: blotchy noise plus a brushed grain."""
    rng = np.random.default_rng(seed)
    n1 = ndimage.gaussian_filter(rng.normal(0, 1, (h, w)), 6)
    n2 = ndimage.gaussian_filter(rng.normal(0, 1, (h, w)), (0.6, 5))
    n1 /= n1.std() + 1e-6
    n2 /= n2.std() + 1e-6
    v = 1 + 0.10 * n1 + 0.06 * n2
    return np.array(base, np.float32)[None, None, :] / 255 * v[..., None]


def rivet(base, cx, cy, r):
    """A domed rivet with a glowing ember centre, drawn into a float array in place."""
    h, w = base.shape[:2]
    box = (int(cx - 3 * r), int(cy - 3 * r), int(cx + 3 * r) + 1, int(cy + 3 * r) + 1)
    x0, y0, x1, y1 = max(box[0], 0), max(box[1], 0), min(box[2], w), min(box[3], h)
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r
    sub = base[y0:y1, x0:x1]
    # Halo on the iron around it.
    halo = np.exp(-((d / 2.1) ** 2))[..., None] * np.array([1.0, 0.45, 0.08], np.float32) * 0.45
    sub += halo
    # Shadow ring, then the dome.
    ring = np.clip(1.15 - d, 0, 1)[..., None] > 0
    sub[:] = np.where(ring, sub * 0.35, sub)
    inside = np.clip((1.0 - d) * r, 0, 1)[..., None]
    lx, ly = (xx - cx) / r + 0.35, (yy - cy) / r + 0.35
    hl = np.exp(-((lx ** 2 + ly ** 2) / 0.18))[..., None]
    core = np.clip(1 - d, 0, 1)[..., None]
    dome = (np.array([0.62, 0.20, 0.03], np.float32) + core * np.array([0.40, 0.55, 0.40], np.float32)
            + hl * np.array([0.35, 0.30, 0.22], np.float32))
    sub[:] = sub * (1 - inside) + dome * inside


def framed_plate(art, seed, label=None):
    """A 12x22-texel plate: iron frame with an orange inner glow line and rivets around `art`."""
    w, h = 12 * SH, 22 * SH
    F = 26  # frame width
    img = iron(w, h, seed)
    # Bevel: light outer rim, shadow on the frame's inside edge.
    img[:3, :] *= 1.55
    img[:, :3] *= 1.45
    img[-3:, :] *= 0.6
    img[:, -3:] *= 0.7
    inner = (F + 6, F + 6, w - F - 6, h - F - 6)
    art = art.resize((inner[2] - inner[0], inner[3] - inner[1]), LZ)
    img[F - 2 : h - F + 2, F - 2 : w - F + 2] = np.array([10, 5, 16], np.float32) / 255  # groove
    img[inner[1] : inner[3], inner[0] : inner[2]] = to_f(art)
    # Orange glow line just inside the groove, spilling a little onto the art and the frame.
    line = Image.new("L", (w, h), 0)
    ImageDraw.Draw(line).rectangle((F + 2, F + 2, w - F - 3, h - F - 3), outline=255, width=3)
    add_glow(img, line, ORANGE, 7, 0.9)
    paint(img, line, ORANGE_HOT, 0.95)
    # Shadow where the frame overhangs the art.
    sh = Image.new("L", (w, h), 0)
    ImageDraw.Draw(sh).rectangle((inner[0], inner[1], inner[2] - 1, inner[3] - 1), outline=255, width=6)
    paint(img, sh.filter(ImageFilter.GaussianBlur(5)), (0, 0, 0), 0.45)
    # Rivets: corners, top/bottom middle, three down each side.
    c = F / 2 + 1
    spots = [(c, c), (w - c, c), (c, h - c), (w - c, h - c), (w / 2, c), (w / 2, h - c)]
    for fy in (0.27, 0.5, 0.73):
        spots += [(c, h * fy), (w - c, h * fy)]
    for x, y in spots:
        rivet(img, x, y, 7.5)
    return from_f(img)


def extend(im, top=0, bottom=0, seed=0):
    """Adds sky above or ground below a picture, continuing its edge colours with stars."""
    w, h = im.size
    out = Image.new("RGB", (w, h + top + bottom))
    out.paste(im, (0, top))
    a = to_f(out)
    if top:
        row = to_f(im)[:6].mean(axis=0)
        row = ndimage.gaussian_filter1d(row, 12, axis=0)
        t = np.linspace(1, 0, top, dtype=np.float32)[:, None, None]
        a[:top] = row[None] * (1 - 0.35 * t)
        st = np.asarray(stars((w, top), top * w // 1400, 0.4, 1.2, seed), np.float32)[..., None] / 255
        a[:top] += st * 0.75 * (0.25 + 0.75 * t)
        # Blend the seam.
        k = min(24, h)
        ramp = np.linspace(0, 1, k, dtype=np.float32)[:, None, None]
        a[top : top + k] = a[top : top + k] * ramp + row[None] * (1 - ramp)
    if bottom:
        row = to_f(im)[-6:].mean(axis=0)
        row = ndimage.gaussian_filter1d(row, 12, axis=0)
        t = np.linspace(0, 1, bottom, dtype=np.float32)[:, None, None]
        a[h + top :] = row[None] * (1 - 0.55 * t)
        k = min(24, h)
        ramp = np.linspace(1, 0, k, dtype=np.float32)[:, None, None]
        a[top + h - k : top + h] = a[top + h - k : top + h] * ramp + row[None] * (1 - ramp)
    return from_f(a)


def build_halloween_shield():
    out = blank((64 * SH, 64 * SH))
    iw, ih = 12 * SH - 2 * 32, 22 * SH - 2 * 32  # plate art area (see framed_plate)

    # Front: the jack-o'-lantern under the moon, ground extended below for the title.
    crop = HALLOWEEN.crop((50, 47, 325, 516))
    crop = crop.resize((iw, round(crop.height * iw / crop.width)), LZ)
    front = extend(crop, bottom=ih - crop.height, seed=5)
    f = to_f(front)
    title = Image.new("L", front.size, 0)
    font = ImageFont.truetype(FONT, 42)
    ty = ih - (ih - crop.height) // 2 + 4
    d = ImageDraw.Draw(title)
    x = iw / 2 - (font.getlength("HALLOWEEN") + 3 * 8) / 2
    for ch in "HALLOWEEN":  # tracked by hand
        d.text((x, ty), ch, font=font, fill=255, anchor="lm")
        x += font.getlength(ch) + 3
    add_glow(f, title, ORANGE, 10, 1.1)
    paint(f, title, CREAM)
    dots = Image.new("L", front.size, 0)
    dd = ImageDraw.Draw(dots)
    dd.line((iw / 2 - 110, ty + 38, iw / 2 - 20, ty + 38), fill=200, width=2)
    dd.line((iw / 2 + 20, ty + 38, iw / 2 + 110, ty + 38), fill=200, width=2)
    sparkle(dd, iw / 2, ty + 38, 11, 255)
    add_glow(f, dots, ORANGE, 5, 0.8)
    paint(f, dots, ORANGE_HOT)
    front = unsharp(from_f(f), 2, 50, 2)
    plate = framed_plate(front, 11)
    out.paste(plate, (SH, SH))

    # Back: the night sky and moon from the cape's inner face, sky extended upwards.
    crop = HALLOWEEN.crop((375, 31, 687, 531))
    crop = crop.resize((iw, round(crop.height * iw / crop.width)), LZ)
    back = extend(crop, top=ih - crop.height, seed=6)
    # Lift the near-black sky a little so the back reads as purple night in first person.
    bf = to_f(back)
    bf = bf ** 0.82 + np.array([0.035, 0.01, 0.06], np.float32) * (1 - bf.mean(axis=2, keepdims=True))
    # A violet glow in the upper sky: first person mostly shows the top of the back.
    yy = np.linspace(0, 1, bf.shape[0], dtype=np.float32)[:, None, None]
    xx = np.linspace(-1, 1, bf.shape[1], dtype=np.float32)[None, :, None]
    bf += np.exp(-((yy - 0.18) / 0.22) ** 2 - (xx / 0.9) ** 2) * np.array([0.16, 0.05, 0.24], np.float32)
    back = unsharp(from_f(bf), 2, 40, 2)
    out.paste(framed_plate(back, 12), (14 * SH, SH))

    # Edges and the handle: plain iron.
    edge = iron(22 * SH, 22 * SH, 13)
    e = from_f(edge)
    out.paste(e.crop((0, 0, SH, 22 * SH)), (0, SH))
    out.paste(e.crop((SH, 0, 2 * SH, 22 * SH)), (13 * SH, SH))
    top = from_f(iron(12 * SH, SH, 14) * 1.2)
    out.paste(top, (SH, 0))
    out.paste(from_f(iron(12 * SH, SH, 15) * 0.8), (13 * SH, 0))
    out.paste(from_f(iron(16 * SH, 12 * SH, 16, base=(40, 30, 46))), (26 * SH, 0))
    return out, plate


# ---------------------------------------------------------------- bandana
N = 2048
SS = 2  # vector layers are drawn at 4096 and reduced


def build_halloween_bandana():
    B = N * SS

    def p(f):
        return f * B

    img = radial((N, N), (N * 0.5, N * 0.56), N * 0.78, (78, 30, 112), (16, 7, 30), 1.2)
    # A faint orange glow rising from the bottom, like the cape's horizon.
    yy = np.linspace(0, 1, N, dtype=np.float32)[:, None, None]
    img += np.clip((yy - 0.55) / 0.45, 0, 1) ** 2 * np.array([0.22, 0.07, 0.02], np.float32)
    # Darker border band.
    band = Image.new("L", (B, B), 0)
    bd = ImageDraw.Draw(band)
    bd.rectangle((p(0.045), p(0.045), p(0.955), p(0.955)), fill=255)
    bd.rectangle((p(0.118), p(0.118), p(0.882), p(0.882)), fill=0)
    paint(img, down(band, (N, N)), (14, 5, 24), 0.55)
    outer = Image.new("L", (B, B), 0)
    od = ImageDraw.Draw(outer)
    od.rectangle((0, 0, B, B), fill=255)
    od.rectangle((p(0.045), p(0.045), p(0.955), p(0.955)), fill=0)
    paint(img, down(outer, (N, N)), (10, 4, 18), 0.4)

    # Stars: many faint, some bright, a few sparkles.
    add_glow(img, stars((N, N), 2600, 0.5, 1.5, 7), (255, 236, 220), 0.01, 0.8)
    big = stars((N, N), 160, 1.4, 2.6, 8)
    add_glow(img, big, (255, 220, 190), 3, 0.6)
    add_glow(img, big, (255, 240, 225), 0.01, 0.9)

    # ---- lines: dashed edge, band lines, dotted frame.
    lines = Image.new("L", (B, B), 0)
    ld = ImageDraw.Draw(lines)
    lw = int(p(0.0042))
    for f in (0.045, 0.118):
        ld.rectangle((p(f), p(f), p(1 - f), p(1 - f)), outline=255, width=lw)
    dashes = Image.new("L", (B, B), 0)
    dd = ImageDraw.Draw(dashes)
    e0, e1, step, dash = p(0.022), p(0.978), p(0.0315), p(0.019)
    t = e0
    while t < e1 - dash / 2:
        t1 = min(t + dash, e1)
        for seg in ((t, e0, t1, e0), (t, e1, t1, e1), (e0, t, e0, t1), (e1, t, e1, t1)):
            dd.line(seg, fill=255, width=int(p(0.0026)))
        t += step
    dots = Image.new("L", (B, B), 0)
    dtd = ImageDraw.Draw(dots)
    f0, f1, r = p(0.137), p(0.863), p(0.0028)
    count = 62
    for i in range(count + 1):
        q = f0 + (f1 - f0) * i / count
        for x, y in ((q, f0), (q, f1), (f0, q), (f1, q)):
            dtd.ellipse((x - r, y - r, x + r, y + r), fill=255)

    # ---- the band motif: pumpkins and bats, upright towards the centre on every side.
    motif = blank((B, B))
    motif_glow = Image.new("L", (B, B), 0)
    size = int(p(0.048))
    pk = pumpkin_icon(size)
    # Bats wider and flatter than the pumpkins so they read as bats, not hearts, when small.
    bw = int(p(0.066))
    bat = bat_mask(bw).resize((bw, int(bw * 0.8)), LZ)
    bat_rgba = Image.new("RGBA", bat.size, ORANGE + (255,))
    bat_rgba.putalpha(bat)
    n_icons = 11
    a0, a1 = p(0.155), p(0.845)
    mid = p(0.0815)
    rot = {"top": Image.ROTATE_180, "bottom": None, "left": Image.ROTATE_270, "right": Image.ROTATE_90}
    for side in ("top", "bottom", "left", "right"):
        count = n_icons if side in ("top", "bottom") else 9
        for i in range(count):
            q = a0 + (a1 - a0) * i / (count - 1)
            icon = pk if i % 2 == 0 else bat_rgba
            if side in ("left", "right"):
                # The head's sides squeeze this band about 2-4x along it (BandanaMesh maps the
                # band's width to the side's height), so these icons are drawn wider to match.
                icon = icon.resize((int(icon.width * 1.4), int(icon.height * 0.95)), LZ)
            if rot[side] is not None:
                icon = icon.transpose(rot[side])
            if side == "top":
                cx, cy = q, mid
            elif side == "bottom":
                cx, cy = q, B - mid
            elif side == "left":
                cx, cy = mid, q
            else:
                cx, cy = B - mid, q
            pos = (int(cx - icon.width / 2), int(cy - icon.height / 2))
            motif.alpha_composite(icon, pos)
            motif_glow.paste(ImageChops.lighter(motif_glow.crop((*pos, pos[0] + icon.width, pos[1] + icon.height)),
                                                icon.getchannel("A")), pos)

    # ---- corner medallions (the knot shows one): ring with a pumpkin inside.
    med_lines = Image.new("L", (B, B), 0)
    mld = ImageDraw.Draw(med_lines)
    mr = p(0.026)
    msize = int(p(0.032))
    mpk = pumpkin_icon(msize)
    # Upright everywhere: the knot shows the top-left one the way the art has it.
    for cx, cy, tr in ((p(0.08), p(0.08), None), (p(0.92), p(0.08), None),
                       (p(0.08), p(0.92), None), (p(0.92), p(0.92), None)):
        mld.ellipse((cx - mr, cy - mr, cx + mr, cy + mr), outline=255, width=lw)
        icon = mpk if tr is None else mpk.transpose(tr)
        motif.alpha_composite(icon, (int(cx - msize / 2), int(cy - msize / 2 + p(0.002))))
    # Cut the band lines where the medallions sit.
    hole = Image.new("L", (B, B), 0)
    hd = ImageDraw.Draw(hole)
    for cx in (p(0.08), p(0.92)):
        for cy in (p(0.08), p(0.92)):
            hd.ellipse((cx - mr * 1.25, cy - mr * 1.25, cx + mr * 1.25, cy + mr * 1.25), fill=255)
    lines = ImageChops.subtract(lines, hole)
    dashes_n = down(dashes, (N, N))
    paint(img, down(hole, (N, N)), (16, 6, 26), 0.92)

    # ---- inner panel: corner crescents with bats and sparkles.
    panel = blank((B, B))
    moon_mask = Image.new("L", (B, B), 0)
    bat_layer = Image.new("L", (B, B), 0)
    spark = Image.new("L", (B, B), 0)
    sd = ImageDraw.Draw(spark)
    cs = int(p(0.105))
    corners = [(0.215, 0.215, 225, False), (0.785, 0.215, 315, True), (0.215, 0.785, 135, False), (0.785, 0.785, 45, True)]
    for fx, fy, toward, flip in corners:
        # The bite faces the panel's centre-out diagonal so the horns hug the corner.
        cm = crescent_mask(cs, toward + 180, 0.40)
        cx, cy = p(fx), p(fy)
        moon_mask.paste(cm, (int(cx - cs / 2), int(cy - cs / 2)), cm)
        # A bat flying past each moon, towards the centre line.
        bs = int(p(0.05))
        bx = cx + (p(0.085) if fx < 0.5 else -p(0.085))
        by = cy + (p(0.035) if fy < 0.5 else -p(0.06))
        bm = bat_mask(bs, flip)
        bat_layer.paste(bm, (int(bx - bs / 2), int(by - bs / 2)), bm)
        bs2 = int(p(0.03))
        bm2 = bat_mask(bs2, not flip)
        bx2 = cx + (p(0.02) if fx < 0.5 else -p(0.02))
        by2 = cy + (p(0.085) if fy < 0.5 else -p(0.085))
        bat_layer.paste(bm2, (int(bx2 - bs2 / 2), int(by2 - bs2 / 2)), bm2)
        sparkle(sd, cx + (p(0.06) if fx < 0.5 else -p(0.06)), cy + (-p(0.04) if fy < 0.5 else p(0.04)), p(0.012), 255)
    # Small sparkles and crescents scattered along the panel's sides.
    for fx, fy, rr in ((0.5, 0.17, 0.011), (0.5, 0.83, 0.011), (0.17, 0.5, 0.011), (0.83, 0.5, 0.011),
                       (0.36, 0.2, 0.007), (0.64, 0.2, 0.007), (0.36, 0.8, 0.007), (0.64, 0.8, 0.007),
                       (0.2, 0.36, 0.007), (0.2, 0.64, 0.007), (0.8, 0.36, 0.007), (0.8, 0.64, 0.007)):
        sparkle(sd, p(fx), p(fy), p(rr), 255)
    for fx, fy, ang in ((0.29, 0.155, 0), (0.71, 0.155, 180), (0.29, 0.845, 0), (0.71, 0.845, 180),
                        (0.155, 0.29, 90), (0.155, 0.71, 270), (0.845, 0.29, 90), (0.845, 0.71, 270)):
        sm = crescent_mask(int(p(0.022)), ang, 0.45)
        moon_mask.paste(sm, (int(p(fx) - sm.width / 2), int(p(fy) - sm.width / 2)), sm)

    # ---- centre emblem.
    c = B / 2
    r_out, r_in = p(0.268), p(0.192)
    ring_fill = Image.new("L", (B, B), 0)
    rd = ImageDraw.Draw(ring_fill)
    rd.ellipse((c - r_out, c - r_out, c + r_out, c + r_out), fill=255)
    rd.ellipse((c - r_in, c - r_in, c + r_in, c + r_in), fill=0)
    ring_lines = Image.new("L", (B, B), 0)
    rld = ImageDraw.Draw(ring_lines)
    for rr, wd in ((r_out, lw), (r_in, lw), (r_out + p(0.012), int(lw * 0.5))):
        rld.ellipse((c - rr, c - rr, c + rr, c + rr), outline=255, width=wd)
    text = Image.new("L", (B, B), 0)
    font = ImageFont.truetype(FONT, int(p(0.047)))
    r_text = (r_out + r_in) / 2
    arc_text(text, "HALLOWEEN", c, c + p(0.003), r_text, font, p(0.011))
    font2 = ImageFont.truetype(FONT, int(p(0.043)))
    arc_text(text, "SHARD", c, c - p(0.002), r_text, font2, p(0.026), bottom=True)
    ring_spark = Image.new("L", (B, B), 0)
    rsd = ImageDraw.Draw(ring_spark)
    for sx in (c - r_text, c + r_text):
        sparkle(rsd, sx, c, p(0.016), 255, 0.22)

    # Inner disc: its own sky, the moon behind, the jack-o'-lantern in front.
    D = int(2 * r_in / SS)  # disc diameter at output scale
    disc = radial((D, D), (D * 0.5, D * 0.42), D * 0.62, (96, 40, 128), (30, 10, 48), 1.1)
    ty = np.linspace(0, 1, D, dtype=np.float32)[:, None, None]
    warm = np.clip((ty - 0.38) / 0.62, 0, 1) ** 1.2
    disc = disc * (1 - warm) + np.array([0.26, 0.10, 0.07], np.float32) * warm
    add_glow(disc, stars((D, D), 140, 0.5, 1.4, 9), (255, 236, 220), 0.01, 0.9)
    moon = moon_cutout()
    md = int(D * 0.56)
    moon = moon.resize((md, md), LZ)
    mimg = blank((D, D))
    mimg.alpha_composite(moon, (int(D / 2 - md / 2), int(D * 0.04)))
    # Moon glow.
    mg = Image.new("L", (D, D), 0)
    ImageDraw.Draw(mg).ellipse((D / 2 - md * 0.45, D * 0.04 + md * 0.05, D / 2 + md * 0.45, D * 0.04 + md * 0.95), fill=255)
    add_glow(disc, mg, (255, 230, 170), D * 0.06, 0.35)
    over(disc, mimg)
    pumpkin = pumpkin_cutout()
    pw = int(D * 0.70)
    ph = round(pumpkin.height * pw / pumpkin.width)
    pumpkin = unsharp(pumpkin.resize((pw, ph), LZ), 2, 45, 1)
    ppos = (int(D / 2 - pw / 2), int(D * 0.96 - ph))
    glowm = Image.new("L", (D, D), 0)
    glowm.paste(pumpkin.getchannel("A"), ppos)
    add_glow(disc, glowm, (255, 150, 40), D * 0.05, 0.6)
    # A dark hill for it to sit on, with a rim of warm light.
    hill = Image.new("L", (D * 4, D * 4), 0)
    ImageDraw.Draw(hill).ellipse((-D * 1.0, D * 4 * 0.875, D * 5.0, D * 4 * 1.6), fill=255)
    hill = hill.resize((D, D), LZ)
    add_glow(disc, hill, (255, 150, 60), 3, 0.5)
    paint(disc, hill, (24, 10, 22))
    pl = blank((D, D))
    pl.alpha_composite(pumpkin, ppos)
    over(disc, pl)
    # Inner shadow at the rim.
    yy2, xx2 = np.mgrid[0:D, 0:D].astype(np.float32)
    dd2 = np.sqrt((xx2 - D / 2 + 0.5) ** 2 + (yy2 - D / 2 + 0.5) ** 2) / (D / 2)
    disc *= (1 - 0.55 * np.clip((dd2 - 0.82) / 0.18, 0, 1) ** 2)[..., None]
    disc_mask = Image.new("L", (D * 4, D * 4), 0)
    ImageDraw.Draw(disc_mask).ellipse((0, 0, D * 4 - 1, D * 4 - 1), fill=255)
    disc_mask = disc_mask.resize((D, D), LZ)
    disc_im = from_f(disc).convert("RGBA")
    disc_im.putalpha(disc_mask)

    # ---- composite at output scale.
    img_c = img
    paint(img_c, down(ring_fill, (N, N)), (16, 6, 26), 0.88)
    full = blank((N, N))
    full.alpha_composite(disc_im, (int(N / 2 - D / 2), int(N / 2 - D / 2)))
    over(img_c, full)

    def glow_and_paint(mask_big, color_core, glow_r, glow_k, core_op=1.0, glow_color=ORANGE):
        m = down(mask_big, (N, N))
        add_glow(img_c, m, glow_color, glow_r, glow_k)
        paint(img_c, m, color_core, core_op)

    # Crescent moons: cream with a warm halo.
    glow_and_paint(moon_mask, (255, 236, 196), 14, 0.55, 1.0, (255, 190, 110))
    # Bats: dark silhouettes rimmed in orange.
    bm = down(bat_layer, (N, N))
    add_glow(img_c, bm, ORANGE, 5, 1.1)
    paint(img_c, bm, (20, 8, 26))
    glow_and_paint(spark, (255, 226, 180), 6, 0.6)
    glow_and_paint(dots, ORANGE_HOT, 4, 0.7, 0.95)
    add_glow(img_c, dashes_n, ORANGE, 3, 0.35)
    paint(img_c, dashes_n, (255, 200, 140), 0.75)
    glow_and_paint(lines, ORANGE_HOT, 9, 1.0)
    glow_and_paint(med_lines, ORANGE_HOT, 8, 1.0)
    glow_and_paint(ring_lines, ORANGE_HOT, 10, 1.0)
    # Motif icons with a soft orange glow behind.
    add_glow(img_c, down(motif_glow, (N, N)), ORANGE, 8, 0.55)
    over(img_c, down(motif, (N, N)))
    glow_and_paint(ring_spark, ORANGE_HOT, 7, 0.8)
    glow_and_paint(text, CREAM, 9, 0.9)
    return from_f(img_c)


# ---------------------------------------------------------------- previews
def starry_background(size, seed, inner=(70, 26, 104), outer=(14, 6, 26)):
    w, h = size
    bg = radial(size, (w * 0.5, h * 0.55), max(w, h) * 0.7, inner, outer, 1.0)
    add_glow(bg, stars(size, w * h // 900, 0.5, 1.6, seed), (255, 236, 220), 0.01, 0.9)
    big = stars(size, w * h // 14000, 1.3, 2.4, seed + 1)
    add_glow(bg, big, (255, 210, 170), 3, 0.5)
    add_glow(bg, big, (255, 240, 225), 0.01, 0.9)
    return bg


def bandana_preview(bandana, size=720):
    bg = starry_background((size, size), 41)
    k = size * 0.69  # bandana side so its diagonal fits with a margin
    b = bandana.resize((int(k), int(k)), LZ).convert("RGBA").rotate(45, resample=Image.BICUBIC, expand=True)
    m = Image.new("L", (size, size), 0)
    pos = ((size - b.width) // 2, (size - b.height) // 2)
    m.paste(b.getchannel("A"), pos)
    add_glow(bg, m, (255, 120, 30), 26, 0.55)
    layer = blank((size, size))
    layer.alpha_composite(b, pos)
    over(bg, layer)
    return from_f(bg)


def bundle_preview(cape_front, bandana, shield_plate):
    W, H = 1280, 720
    bg = starry_background((W, H), 51)
    yy = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    bg += np.clip((yy - 0.6) / 0.4, 0, 1) ** 2 * np.array([0.25, 0.08, 0.02], np.float32)

    def place(im, center, height, rotate=0):
        w = round(im.width * height / im.height)
        im = im.resize((w, height), LZ).convert("RGBA")
        if rotate:
            im = im.rotate(rotate, resample=Image.BICUBIC, expand=True)
        pos = (int(center[0] - im.width / 2), int(center[1] - im.height / 2))
        m = Image.new("L", (W, H), 0)
        m.paste(im.getchannel("A"), pos)
        add_glow(bg, m, (255, 120, 30), 22, 0.5)
        sh = Image.new("L", (W, H), 0)
        sh.paste(im.getchannel("A"), (pos[0] + 6, pos[1] + 10))
        paint(bg, sh.filter(ImageFilter.GaussianBlur(12)), (0, 0, 0), 0.5)
        layer = blank((W, H))
        layer.alpha_composite(im, pos)
        over(bg, layer)

    cy = 405
    place(cape_front, (220, cy), 460)
    place(bandana, (640, cy + 5), 330, rotate=45)
    place(shield_plate, (1060, cy), 460)

    title = Image.new("L", (W, H), 0)
    td = ImageDraw.Draw(title)
    font = ImageFont.truetype(FONT, 96)
    word = "HALLOWEEN"
    track = 10
    total = sum(font.getlength(ch) for ch in word) + track * (len(word) - 1)
    x = W / 2 - total / 2
    for ch in word:
        td.text((x, 92), ch, font=font, fill=255, anchor="lm")
        x += font.getlength(ch) + track
    add_glow(bg, title, ORANGE, 18, 1.2)
    paint(bg, title, CREAM)
    sub = Image.new("L", (W, H), 0)
    sd = ImageDraw.Draw(sub)
    sfont = ImageFont.truetype(FONT, 26)
    sd.text((W / 2, 158), "Shard special set", font=sfont, fill=255, anchor="mm")
    add_glow(bg, sub, ORANGE, 6, 0.5)
    paint(bg, sub, ORANGE_HOT)

    labels = Image.new("L", (W, H), 0)
    ld = ImageDraw.Draw(labels)
    lfont = ImageFont.truetype(FONT, 22)
    for text, x in (("CAPE", 220), ("BANDANA", 640), ("SHIELD", 1060)):
        spaced = " ".join(text)
        ld.text((x, 670), spaced, font=lfont, fill=255, anchor="mm")
    paint(bg, labels, (226, 196, 214), 0.85)
    return from_f(bg)


# ---------------------------------------------------------------- main
def main():
    shard = cape_from_layout("shard-cape-source.webp")
    save(shard, TEX / "cape-shard.png")
    save(cape_front_preview(shard), PREV / "cape-shard.png")

    halloween = cape_from_layout("halloween-cape-source.webp")
    save(halloween, TEX / "cape-halloween.png")
    h_front = cape_front_preview(halloween)
    save(h_front, PREV / "cape-halloween.png")

    ocean = build_ocean_cape()
    save(ocean, TEX / "cape-ocean.png")
    save(cape_front_preview(ocean), PREV / "cape-ocean.png")

    shield, plate = build_halloween_shield()
    save(shield, TEX / "shield-halloween.png")
    save(plate.resize((round(plate.width * 720 / plate.height), 720), LZ), PREV / "shield-halloween.png")

    bandana = build_halloween_bandana()
    save(bandana.convert("RGBA"), TEX / "bandana-halloween.png")
    save(bandana_preview(bandana), PREV / "bandana-halloween.png")

    save(bundle_preview(h_front, bandana, plate), PREV / "bundle-halloween.png")


if __name__ == "__main__":
    main()
