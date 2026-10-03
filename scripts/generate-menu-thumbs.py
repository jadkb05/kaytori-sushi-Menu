"""
Génère les vignettes WebP du menu digital (/menu) à partir des photos d'origine.

  python3 scripts/generate-menu-thumbs.py

Source : public/menu-hd-*/ et public/starters-hd/ (fichiers d'origine conservés, jamais modifiés).
Sortie : public/menu-thumbs/<dossier>/<nom>-136.webp et -204.webp (vignette 68 px en 2x / 3x).
Une image plus petite que la cible n'est pas agrandie. Nécessite Pillow (pip install Pillow).
"""
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
OUT = PUBLIC / "menu-thumbs"
SIZES = (136, 204)
EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def sources():
    for folder in sorted(PUBLIC.glob("menu-hd-*")) + [PUBLIC / "starters-hd"]:
        for f in sorted(folder.iterdir()):
            if f.suffix.lower() in EXTENSIONS and not f.name.startswith("_"):
                yield f


def main():
    count, total = 0, 0
    for src in sources():
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)
            im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
            for size in SIZES:
                side = min(size, im.width, im.height)
                thumb = ImageOps.fit(im, (side, side), Image.LANCZOS, centering=(0.5, 0.5))
                dest = OUT / src.parent.name / f"{src.stem}-{size}.webp"
                dest.parent.mkdir(parents=True, exist_ok=True)
                thumb.save(dest, "WEBP", quality=78, method=6)
                count += 1
                total += dest.stat().st_size
    print(f"{count} vignettes, {total / 1024:.0f} Ko au total")


if __name__ == "__main__":
    main()
