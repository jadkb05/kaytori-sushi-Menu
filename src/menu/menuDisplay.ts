/**
 * Helpers d'affichage du menu digital.
 * Lecture seule : aucune donnée de src/data/ n'est modifiée ici.
 */
import { CLIENT_DISH_IMAGES, CUSTOM_DISH_IMAGES } from "../data/dishImages";
import { STARTER_IMAGE_URL_BY_ID } from "../data/startersYakamon";
import { CLIENT_SUSHU_POOL } from "../data/clientSushuPhotoPool";
import { ZIP_ORDER_DISH_IMAGES } from "../data/zipOrderDishImages";
import type { YumloMenuItem } from "../data/yumloMenu";

export function formatPriceDH(priceMAD: string) {
  const parts = priceMAD.split(".");
  const int = parts[0] ?? "0";
  let dec = parts[1] ?? "00";
  if (dec.length === 1) dec = `${dec}0`;
  if (dec.length > 2) dec = dec.slice(0, 2);
  return `${int},${dec}`;
}

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function categoryAnchorId(c: string) {
  return (
    "menu-cat-" +
    norm(c)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

function dishPoolFallback(id: string): string | undefined {
  const pool: readonly string[] = CLIENT_SUSHU_POOL;
  if (pool.length === 0) return undefined;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}

/**
 * Image affichée d'un plat. `item.image` est prioritaire : en mode Supabase, c'est la photo
 * gérée depuis l'admin (products.image_url). En mode statique, `image` est identique à l'entrée
 * des tables ci-dessous pour chaque plat (vérifié par le test de référence) : rendu inchangé.
 * Les tables ne servent plus que de repli si un plat n'a pas d'image.
 */
export function dishImage(item: YumloMenuItem) {
  return (
    (item.image || undefined) ??
    STARTER_IMAGE_URL_BY_ID[item.id] ??
    CLIENT_DISH_IMAGES[item.id] ??
    CUSTOM_DISH_IMAGES[item.id] ??
    ZIP_ORDER_DISH_IMAGES[item.id] ??
    dishPoolFallback(item.id) ??
    item.image
  );
}

/**
 * Vignettes WebP légères (scripts/generate-menu-thumbs.py) pour une image d'origine de
 * /menu-hd-*\/ ou /starters-hd/ : 224 px et 336 px pour un affichage en 88–112 px.
 * null pour toute autre image : on garde alors l'original.
 */
export function dishThumbs(src: string): { small: string; large: string } | null {
  const m = src.match(/^\/((?:menu-hd-[^/]+)|starters-hd)\/([^/]+)\.(?:png|jpe?g|webp)$/i);
  if (!m) return null;
  const base = `/menu-thumbs/${m[1]}/${m[2]}`;
  return { small: `${base}-224.webp`, large: `${base}-336.webp` };
}

/** Prix le plus bas parmi les variantes (affichage « dès X DH ») ; prix du plat sinon. */
export function lowestPriceMAD(item: YumloMenuItem): string {
  if (!item.variants || item.variants.length === 0) return item.priceMAD;
  let best = item.variants[0].priceMAD;
  for (const v of item.variants) {
    if (Number.parseFloat(v.priceMAD) < Number.parseFloat(best)) best = v.priceMAD;
  }
  return best;
}

/** Icônes emoji par catégorie */
const CATEGORY_ICONS: Record<string, string> = {
  Starters: "🥟",
  "Nems & Gyoza & Rouleaux de printemps": "🥢",
  "Sushi Fusion": "🍕",
  Yakitori: "🍢",
  Soupes: "🍜",
  Salades: "🥗",
  "Poké Bowl": "🥣",
  Tartare: "🐟",
  Chirashi: "🍱",
  Sashimi: "🍣",
  Carpaccio: "🐟",
  Tacos: "🌮",
  "Crispy Rice": "🍙",
  Nigiri: "🍣",
  Maki: "🌯",
  Futomaki: "🌯",
  "California Roll": "🍣",
  "Special Roll": "✨",
  Aromaki: "🍃",
  Blossom: "🌸",
  Premium: "⭐",
  "Makito Fry": "🍤",
  "Crispy Roll": "🔥",
  "Crunchy Roll": "🔥",
  "Wok & Thaï": "🥡",
  Bentos: "🍱",
  "Plats Thaï": "🍛",
  Assortiments: "🎁",
  Desserts: "🍰",
  Jus: "🍹",
  Boissons: "🥤",
};

export function categoryIcon(c: string): string {
  if (CATEGORY_ICONS[c]) return CATEGORY_ICONS[c];
  for (const k in CATEGORY_ICONS) {
    if (c.toLowerCase().includes(k.toLowerCase())) return CATEGORY_ICONS[k];
  }
  return "🍣";
}
