/**
 * Helpers d'affichage du menu digital.
 * Lecture seule : aucune donnée de src/data/ n'est modifiée ici.
 */
import { CLIENT_DISH_IMAGES, CUSTOM_DISH_IMAGES } from "../data/dishImages";
import { STARTER_IMAGE_URL_BY_ID } from "../data/startersYakamon";
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

/**
 * Nombre de pièces affiché après le titre de certaines catégories (comme le menu PDF client).
 * Affichage uniquement : le nom réel de la catégorie (données, Supabase, ancres, WhatsApp) ne change pas.
 */
const CATEGORY_PIECES: ReadonlyMap<string, string> = new Map([
  ["Yakitori", "2 pcs"],
  ["Sashimi", "4 pcs"],
  ["Carpaccio", "8 pcs"],
  ["Tataki", "5 pcs"],
  ["Okinawa", "4 pcs"],
  ["Tacos", "2 pcs"],
  ["Crispy Rice", "2 pcs"],
  ["Gunkan", "2 pcs"],
  ["Nigiri", "2 pcs"],
  ["Temakis", "1 pc"],
  ["Maki", "6 pcs"],
  ["Futomaki", "5 pcs"],
  ["California Roll", "4 pcs"],
  ["Special Roll", "4 pcs"],
  ["Aromaki", "6 pcs"],
  ["Slim Roll", "4 pcs"],
  ["Spring Roll", "5 pcs"],
  ["Blossom", "4 pcs"],
  ["Premium", "4 pcs"],
  ["Makito Fry", "6 pcs"],
  ["Crispy Roll", "6 pcs"],
  ["Crunchy Roll", "6 pcs"],
]);

/** Titre affiché d'une catégorie : « Nigiri (2 pcs) », ou le nom seul si aucune quantité n'est prévue. */
export function categoryDisplayTitle(category: string): string {
  const pieces = CATEGORY_PIECES.get(category);
  return pieces ? `${category} (${pieces})` : category;
}

/**
 * Nom affiché d'un plat sous le titre de sa catégorie : le préfixe répétant la catégorie est retiré
 * (« Tartare Saumon Avocat » dans Tartare → « Saumon Avocat »).
 * Affichage uniquement : le nom réel (données, Supabase, panier, WhatsApp) ne change pas.
 *
 * Règle stricte : la catégorie exacte (casse et accents compris), ou son singulier sans « s » final
 * (« Soupe Royale » dans Soupes → « Royale »), suivie d'un espace. Le nom reste intact s'il ne
 * commence pas ainsi, s'il est égal à la catégorie, ou si le reste ne serait plus parlant :
 * quantité seule (« Sashimi (4 pcs) ») ou lettre seule (« Bento A » dans Bentos).
 */
export function getDisplayProductName(product: { name: string }, category: string): string {
  const { name } = product;
  if (category === "") return name;
  const singular = category.endsWith("s") ? category.slice(0, -1) : null;
  const prefix = [category, singular].find((p) => p && name.startsWith(p) && /^\s/.test(name.slice(p.length)));
  if (!prefix) return name;
  const shortName = name.slice(prefix.length).trim();
  const withoutQuantity = shortName.replace(/\([^)]*\)/g, "").replace(/\b\d+\s*pcs?\b/gi, "");
  return /\p{L}{2}/u.test(withoutQuantity) ? shortName : name;
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
