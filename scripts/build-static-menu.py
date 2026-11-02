"""
Construit le menu statique à partir d'un export de la base Supabase de production.

  python3 scripts/build-static-menu.py <dossier-lignes> <dossier-fichiers-du-bucket>

  <dossier-lignes>             categories.json, products.json, product_variants.json,
                               formule_sections.json, cover_banners.json, site_settings.json
                               (lignes brutes de PostgREST, une liste JSON par table)
  <dossier-fichiers-du-bucket> copie du bucket menu-images (products/…, cover/…)

Sorties (dans le dépôt) :
  src/data/menu.json                   lignes publiques (mêmes règles de visibilité que la RLS)
  public/media/<chemin du bucket>      photo d'origine, octet pour octet (SHA-256 vérifié)
  public/media/<chemin>-<largeur>.webp versions allégées : mêmes règles que la transformation
                                       d'images Supabase utilisée jusqu'ici (largeur imposée,
                                       ratio conservé = resize=contain, jamais agrandie,
                                       WebP qualité 75). Redimensionnement uniquement, aucun recadrage.

Le cadrage choisi dans l'ancienne administration est déjà intégré aux pixels des fichiers
(src/admin/lib/photoCrop.ts, retiré) : les copier tels quels conserve le cadrage.
Nécessite Pillow (pip install Pillow).
"""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
MEDIA_DIR = PUBLIC / "media"
OUT_JSON = ROOT / "src" / "data" / "menu.json"

STORAGE_MARKER = "/storage/v1/object/public/menu-images/"
MEDIA_PREFIX = "/media/"
FORMULES_CATEGORY_ID = "formules-promos"

# Largeurs servies aujourd'hui (voir src/lib/media.ts et les composants).
DISH_WIDTHS = (224, 288)  # menuDisplay.ts dishThumbs : DishRow, OrderReview
FORMULE_WIDTHS = (360, 540, 750, 960)  # FormulesCarousel.tsx FORMULE_IMAGE_WIDTHS
COVER_WIDTHS = (640, 960, 1280)  # coverBanners.ts COVER_IMAGE_WIDTHS
WEBP_QUALITY = 75  # imageTransform.ts (Supabase) : quality=75

CATEGORY_COLUMNS = ("id", "name", "sort_order", "is_active", "display_mode")
PRODUCT_COLUMNS = (
    "id", "category_id", "name", "description", "price", "currency", "image_url",
    "thumb_small_url", "thumb_large_url", "sort_order", "is_active", "formule_section_id",
)
VARIANT_COLUMNS = ("product_id", "id", "label", "price", "sort_order", "is_active")
SECTION_COLUMNS = ("id", "name", "description", "sort_order", "is_active")
COVER_COLUMNS = ("id", "image_url", "storage_path", "sort_order", "is_active", "product_id")


def load(rows_dir: Path, table: str) -> list[dict]:
    return json.loads((rows_dir / f"{table}.json").read_text(encoding="utf-8"))


def pick(row: dict, columns: tuple[str, ...]) -> dict:
    return {c: row.get(c) for c in columns}


def by_sort(rows: list[dict]) -> list[dict]:
    return sorted(rows, key=lambda r: (r["sort_order"], r["id"]))


def bucket_path(url: str | None) -> str | None:
    if not url or STORAGE_MARKER not in url:
        return None
    return url.split(STORAGE_MARKER, 1)[1].split("?", 1)[0]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def copy_original(files_dir: Path, path: str) -> None:
    src = files_dir / path
    dest = MEDIA_DIR / path
    digest = sha256(src)
    stem = Path(path).stem
    # Convention du bucket (productPhoto.ts / coverBannerAdmin.ts) : nom = 32 premiers hex du SHA-256.
    if digest[:32] != stem:
        raise SystemExit(f"Empreinte inattendue pour {path} : {digest[:32]}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists() or sha256(dest) != digest:
        shutil.copyfile(src, dest)
    if sha256(dest) != digest:
        raise SystemExit(f"Copie corrompue : {dest}")


def resized_name(path: str, width: int) -> Path:
    p = Path(path)
    return MEDIA_DIR / p.parent / f"{p.stem}-{width}.webp"


def write_resized(path: str, widths: tuple[int, ...]) -> int:
    count = 0
    with Image.open(MEDIA_DIR / path) as source:
        im = ImageOps.exif_transpose(source) or source
        im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
        for width in widths:
            dest = resized_name(path, width)
            if dest.exists():
                continue
            w = min(width, im.width)
            h = max(1, round(im.height * w / im.width))
            out = im if (w, h) == im.size else im.resize((w, h), Image.Resampling.LANCZOS)
            out.save(dest, "WEBP", quality=WEBP_QUALITY, method=6)
            count += 1
    return count


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    rows_dir, files_dir = Path(sys.argv[1]), Path(sys.argv[2])

    # Règles de visibilité publiques (RLS, supabase/migrations/20261006000000_menu_schema.sql) :
    # catégorie active ; produit actif dans une catégorie active ; variante active d'un produit visible ;
    # section et couverture actives.
    categories = by_sort([pick(r, CATEGORY_COLUMNS) for r in load(rows_dir, "categories") if r["is_active"]])
    active_categories = {c["id"] for c in categories}
    products = by_sort([
        pick(r, PRODUCT_COLUMNS) for r in load(rows_dir, "products")
        if r["is_active"] and r["category_id"] in active_categories
    ])
    visible_products = {p["id"] for p in products}
    variants = by_sort([
        pick(r, VARIANT_COLUMNS) for r in load(rows_dir, "product_variants")
        if r["is_active"] and r["product_id"] in visible_products
    ])
    sections = by_sort([pick(r, SECTION_COLUMNS) for r in load(rows_dir, "formule_sections") if r["is_active"]])
    covers = by_sort([pick(r, COVER_COLUMNS) for r in load(rows_dir, "cover_banners") if r["is_active"]])
    settings = [r for r in load(rows_dir, "site_settings") if r["id"] == "default"]
    cover_autoplay = settings[0]["cover_autoplay"] is not False if settings else True

    widths: dict[str, set[int]] = {}

    def localize(url: str | None, needed: tuple[int, ...]) -> str | None:
        path = bucket_path(url)
        if path is None:
            return url
        widths.setdefault(path, set()).update(needed)
        return MEDIA_PREFIX + path

    for p in products:
        needed = DISH_WIDTHS + (FORMULE_WIDTHS if p["category_id"] == FORMULES_CATEGORY_ID else ())
        p["image_url"] = localize(p["image_url"], needed)
    for c in covers:
        c["image_url"] = localize(c["image_url"], COVER_WIDTHS)

    copied = resized = 0
    for path in sorted(widths):
        copy_original(files_dir, path)
        copied += 1
        resized += write_resized(path, tuple(sorted(widths[path])))

    data = {
        "source": "Supabase production (lecture publique, règles RLS), export du 2026-11-02",
        "categories": categories,
        "products": products,
        "product_variants": variants,
        "formule_sections": sections,
        "cover_banners": covers,
        "site_settings": {"cover_autoplay": cover_autoplay},
    }
    OUT_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(
        f"{len(categories)} catégories, {len(products)} produits, {len(variants)} variantes, "
        f"{len(sections)} sections, {len(covers)} couvertures ; "
        f"{copied} photos d'origine, {resized} versions allégées créées"
    )


if __name__ == "__main__":
    main()
