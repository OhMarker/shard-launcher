"""Builds the OhMarker cape: a 4096x2048 texture in Minecraft's 64x32 cape layout (64 px per
cape pixel) plus a 512x512 preview card.

Sources (art/ohmarker-cape/):
  cape-layout-2000.webp  the owner's cape at 2000x1000 (31.25 px per cape pixel)
  banner-2000.webp       the owner's banner; its card is the cape's front at about twice the
                         resolution of the layout file, so the front is taken from there.

Everything else (inner side, edges, elytra) is upscaled from the layout file. Plain resampling
would turn the stars into soft blobs, so each region is split into a smooth background (median
filter) and a star layer; the background is resized smoothly and the star layer is resized and
sharpened separately, then the two are added back together.

Run: python scripts/build-ohmarker-cape.py   (needs Pillow, NumPy, SciPy, OpenCV)
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, median_filter

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'art' / 'ohmarker-cape'
OUT_TEXTURE = ROOT / 'resources' / 'cosmetics' / 'textures' / 'cape-ohmarker.png'
OUT_PREVIEW = ROOT / 'resources' / 'cosmetics' / 'previews' / 'cape-ohmarker.png'

S = 64  # output px per cape pixel (4096x2048)
SRC_S = 2000 / 64  # layout file px per cape pixel

# The card in the banner, inset two pixels from its anti-aliased outer edge.
CARD = (305, 90, 893, 1034)
CARD_RADIUS = 22  # banner px; the card's outer corners are rounded, the cape face is not


def load_rgb(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert('RGB')).astype(np.float32) / 255.0


def enhance(src: np.ndarray, box: tuple[float, float, float, float], size: tuple[int, int]) -> np.ndarray:
    """Upscales src[box] (cape-pixel box in source px) to size (w, h) keeping stars crisp."""
    x0, y0, x1, y1 = box
    pad = 8
    ix0, iy0 = max(0, int(np.floor(x0)) - pad), max(0, int(np.floor(y0)) - pad)
    ix1, iy1 = min(src.shape[1], int(np.ceil(x1)) + pad), min(src.shape[0], int(np.ceil(y1)) + pad)
    crop = src[iy0:iy1, ix0:ix1]
    bg = np.stack([median_filter(crop[..., c], size=7) for c in range(3)], axis=-1)
    bg = gaussian_filter(bg, sigma=(1.0, 1.0, 0))
    stars = np.clip(crop - bg, 0, None)

    w, h = size
    fx = w / (x1 - x0)
    fy = h / (y1 - y0)
    big_w, big_h = int(round(crop.shape[1] * fx)), int(round(crop.shape[0] * fy))
    bg_up = cv2.resize(bg, (big_w, big_h), interpolation=cv2.INTER_CUBIC)
    st_up = cv2.resize(stars, (big_w, big_h), interpolation=cv2.INTER_LANCZOS4)
    st_up = np.clip(st_up, 0, None)
    # Sharpen the stars only: unsharp mask, then a slight contrast curve so points stay points.
    st_up = np.clip(st_up + 1.2 * (st_up - gaussian_filter(st_up, sigma=(1.6, 1.6, 0))), 0, None)
    st_up = st_up ** 0.9
    out = np.clip(bg_up + st_up, 0, 1)
    # Bright areas (the moon) are surfaces, not stars: resample those normally, fading in
    # over a few pixels so there is no seam.
    plain = np.clip(cv2.resize(crop, (big_w, big_h), interpolation=cv2.INTER_LANCZOS4), 0, 1)
    surface = np.clip((bg.mean(axis=2) - 0.30) / 0.08, 0, 1)
    surface = gaussian_filter(cv2.dilate(surface, np.ones((5, 5), np.uint8)), sigma=1.5)
    weight = cv2.resize(surface, (big_w, big_h), interpolation=cv2.INTER_LINEAR)[..., None]
    out = out * (1 - weight) + plain * weight

    ox = int(round((x0 - ix0) * fx))
    oy = int(round((y0 - iy0) * fy))
    return out[oy:oy + h, ox:ox + w]


def front_from_banner(banner: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    x0, y0, x1, y1 = CARD
    card = (banner[y0:y1, x0:x1] * 255).astype(np.uint8)
    # Fill the rounded corners (banner glow shows through them) from the card's own edge.
    h, w = card.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    r = CARD_RADIUS
    for cx, cy in ((r, r), (w - 1 - r, r), (r, h - 1 - r), (w - 1 - r, h - 1 - r)):
        corner = np.zeros((h, w), np.uint8)
        x_lo, x_hi = (0, r) if cx == r else (w - r, w)
        y_lo, y_hi = (0, r) if cy == r else (h - r, h)
        corner[y_lo:y_hi, x_lo:x_hi] = 1
        yy, xx = np.mgrid[0:h, 0:w]
        outside = ((xx - cx) ** 2 + (yy - cy) ** 2) > (r - 1.5) ** 2
        mask |= (corner.astype(bool) & outside).astype(np.uint8)
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8))
    card = cv2.inpaint(card, mask * 255, 6, cv2.INPAINT_TELEA)
    up = cv2.resize(card.astype(np.float32) / 255.0, size, interpolation=cv2.INTER_LANCZOS4)
    return np.clip(up, 0, 1)


def put(atlas: np.ndarray, img: np.ndarray, u: int, v: int) -> None:
    h, w = img.shape[:2]
    atlas[v * S:v * S + h, u * S:u * S + w, :3] = img
    atlas[v * S:v * S + h, u * S:u * S + w, 3] = 1.0


def box(u0: float, v0: float, u1: float, v1: float) -> tuple[float, float, float, float]:
    return (u0 * SRC_S, v0 * SRC_S, u1 * SRC_S, v1 * SRC_S)


def main() -> None:
    layout = load_rgb(ART / 'cape-layout-2000.webp')
    banner = load_rgb(ART / 'banner-2000.webp')
    atlas = np.zeros((32 * S, 64 * S, 4), np.float32)

    # Cape layout (u, v, width, height in cape pixels): top 1,0,10,1; bottom 11,0,10,1;
    # left side 0,1,1,16; front 1,1,10,16; right side 11,1,1,16; inner 12,1,10,16; elytra 22,0,24,22.
    for u, v, w, h in ((1, 0, 10, 1), (11, 0, 10, 1), (0, 1, 1, 16), (11, 1, 1, 16), (12, 1, 10, 16), (22, 0, 24, 22)):
        put(atlas, enhance(layout, box(u, v, u + w, v + h), (w * S, h * S)), u, v)
    put(atlas, front_from_banner(banner, (10 * S, 16 * S)), 1, 1)

    tex = Image.fromarray((atlas * 255 + 0.5).astype(np.uint8), 'RGBA')
    OUT_TEXTURE.parent.mkdir(parents=True, exist_ok=True)
    tex.save(OUT_TEXTURE, optimize=True)

    # Preview card: the front, centred on the cape's own night sky.
    pv = 512
    sky = enhance(layout, box(22, 0, 46, 22), (pv, pv))
    preview = Image.fromarray((sky * 255 + 0.5).astype(np.uint8), 'RGB').convert('RGBA')
    fh = int(pv * 0.86)
    fw = int(round(fh * 10 / 16))
    front = Image.fromarray((atlas[S:17 * S, S:11 * S, :3] * 255 + 0.5).astype(np.uint8), 'RGB')
    front = front.resize((fw, fh), Image.LANCZOS)
    shadow = Image.new('RGBA', (pv, pv), (0, 0, 0, 0))
    sx, sy = (pv - fw) // 2, (pv - fh) // 2
    shadow.paste((0, 0, 0, 120), (sx - 6, sy - 2, sx + fw + 6, sy + fh + 10))
    from PIL import ImageFilter
    preview = Image.alpha_composite(preview, shadow.filter(ImageFilter.GaussianBlur(10)))
    preview.paste(front, (sx, sy))
    preview.save(OUT_PREVIEW, optimize=True)
    print(f'{OUT_TEXTURE.relative_to(ROOT)} {tex.size}, {OUT_PREVIEW.relative_to(ROOT)} {preview.size}')


if __name__ == '__main__':
    main()
