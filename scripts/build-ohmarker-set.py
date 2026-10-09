"""Builds the OhMarker shield, bandana and bundle images for the meta repository.

    python scripts/build-ohmarker-set.py <meta-repo>

Sources are in art/ohmarker-set/. The shield art uses Minecraft's shield texture layout (64x64),
so it is resized to 2048x2048 (32 px per texel). The bandana is the square design the client
wraps over the player's head. Previews are cut from the owner's set preview.
"""
import sys
from pathlib import Path
from PIL import Image

ART = Path(__file__).resolve().parents[1] / "art" / "ohmarker-set"
meta = Path(sys.argv[1])
tex = meta / "cosmetics" / "textures"
prev = meta / "cosmetics" / "previews"
tex.mkdir(parents=True, exist_ok=True)
prev.mkdir(parents=True, exist_ok=True)

shield = Image.open(ART / "shield-source.png").convert("RGBA").resize((2048, 2048), Image.LANCZOS)
shield.save(tex / "shield-ohmarker.png", optimize=True)
bandana = Image.open(ART / "bandana-source.png").convert("RGBA").resize((2048, 2048), Image.LANCZOS)
bandana.save(tex / "bandana-ohmarker.png", optimize=True)

sheet = Image.open(ART / "set-preview-source.png").convert("RGB")  # 2000x1125
def crop(box, name, height=720):
    im = sheet.crop(box)
    w = round(im.width * height / im.height)
    im.resize((w, height), Image.LANCZOS).save(prev / name, optimize=True)
crop((1480, 255, 1910, 1010), "shield-ohmarker.png")
crop((650, 255, 1410, 1010), "bandana-ohmarker.png")
sheet.resize((1280, 720), Image.LANCZOS).save(prev / "bundle-ohmarker.png", optimize=True)
print("built", sorted(p.name for p in tex.iterdir()), sorted(p.name for p in prev.iterdir()))
