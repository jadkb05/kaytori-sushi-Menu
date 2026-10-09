/**
 * Recherche dans le menu affiché (statique ou Supabase) : catégories et plats.
 * Insensible aux accents et à la casse ; chaque mot saisi doit commencer un mot du nom
 * (« saum avo » trouve « Saumon Avocat »), dans n'importe quel ordre. Les noms affichés
 * (sans préfixe de catégorie) et les noms réels sont tous deux pris en compte.
 * Lecture seule : aucune donnée n'est modifiée.
 */
import type { YumloMenuItem } from "../data/yumloMenu";
import { getDisplayProductName } from "./menuDisplay";

/** Nombre maximal de plats proposés. */
export const MAX_PRODUCT_RESULTS = 20;

export type CategoryMatch = { kind: "category"; category: string; count: number };
export type ProductMatch = { kind: "product"; item: YumloMenuItem; displayName: string };
export type SearchMatch = CategoryMatch | ProductMatch;

/** « Tataki Saumon Épicé » → « tataki saumon epice » (accents, casse et ponctuation ignorés). */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Score d'un texte pour la requête (plus petit = meilleur), ou null s'il ne correspond pas :
 * 0 identique · 1 commence par la requête · 2 tous les mots commencent un mot du texte ·
 * 3 la requête apparaît dans le texte (ex. « maki » dans « futomaki »).
 */
function matchScore(text: string, query: string): number | null {
  const t = normalizeSearch(text);
  if (t === query) return 0;
  if (t.startsWith(query)) return 1;
  const words = t.split(" ");
  if (query.split(" ").every((q) => words.some((w) => w.startsWith(q)))) return 2;
  if (t.includes(query)) return 3;
  return null;
}

/**
 * Correspondances pour `query` : catégories d'abord (une catégorie trouvée mène à sa section),
 * puis plats, chacun trié par pertinence puis dans l'ordre du menu.
 */
export function searchMenu(
  menu: { categories: readonly string[]; items: readonly YumloMenuItem[] },
  query: string,
): SearchMatch[] {
  const q = normalizeSearch(query);
  if (q === "") return [];

  const categories: (CategoryMatch & { score: number; order: number })[] = [];
  menu.categories.forEach((category, order) => {
    const count = menu.items.filter((it) => it.category === category).length;
    const score = count > 0 ? matchScore(category, q) : null;
    if (score !== null) categories.push({ kind: "category", category, count, score, order });
  });

  const products: (ProductMatch & { score: number; order: number })[] = [];
  menu.items.forEach((item, order) => {
    const displayName = getDisplayProductName(item, item.category);
    const scores = [matchScore(displayName, q), matchScore(item.name, q)].filter((s): s is number => s !== null);
    if (scores.length > 0) products.push({ kind: "product", item, displayName, score: Math.min(...scores), order });
  });

  const byScore = <T extends { score: number; order: number }>(a: T, b: T) => a.score - b.score || a.order - b.order;
  const strip = <T extends { score: number; order: number }>({ score: _s, order: _o, ...rest }: T) => rest;
  return [
    ...categories.sort(byScore).map(strip),
    ...products.sort(byScore).slice(0, MAX_PRODUCT_RESULTS).map(strip),
  ] as SearchMatch[];
}

/** Ancre d'un plat dans la page (défilement depuis la recherche). */
export function dishAnchorId(id: string): string {
  return `plat-${id}`;
}
