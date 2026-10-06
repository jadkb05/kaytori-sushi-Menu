/**
 * Modèle de parité du menu : forme canonique de ce que le menu public affiche,
 * pour comparer deux sources (aujourd'hui : statique vs référence figée ; plus tard : statique vs Supabase).
 *
 * Capture : catégories (ordre), plats (ordre affiché, sous-sections), IDs, noms, descriptions,
 * prix (bruts et affichés), images (champ source, image affichée, vignettes) et variantes.
 */
import { dishImage, dishThumbs, lowestPriceMAD } from "../menu/menuDisplay";
import { menuCategoryDisplayMode } from "./menuRows";
import { groupItemsForMenuTab } from "./menuTabSections";
import type { MenuSnapshot } from "./menuSource";

export type ParityVariant = {
  id: string;
  label: string;
  priceMAD: string;
};

export type ParityProduct = {
  id: string;
  category: string;
  /** Titre de sous-section affiché au-dessus du plat ("" si aucun). */
  section: string;
  /** Position dans la catégorie, telle qu'affichée (0 = premier). */
  position: number;
  name: string;
  description: string;
  priceMAD: string;
  /** Prix affiché sur la carte (« dès » = variante la moins chère). */
  displayedPriceMAD: string;
  currency: string;
  /** Champ `image` du plat. */
  image: string;
  /** Image réellement affichée (après les tables de correspondance). */
  displayedImage: string;
  thumbs: { small: string; large: string } | null;
  variants: ParityVariant[];
};

export type ParityCategory = {
  name: string;
  position: number;
  productIds: string[];
};

export type MenuParityModel = {
  categories: ParityCategory[];
  products: ParityProduct[];
};

/** Reproduit l'ordre d'affichage de MenuPage : catégories non vides, puis sous-sections. */
export function toParityModel(menu: MenuSnapshot): MenuParityModel {
  const categories: ParityCategory[] = [];
  const products: ParityProduct[] = [];

  for (const category of menu.categories) {
    const items = menu.items.filter((it) => it.category === category);
    if (items.length === 0) continue;
    const productIds: string[] = [];
    let position = 0;
    for (const group of groupItemsForMenuTab(category, [...items], menuCategoryDisplayMode(menu, category))) {
      for (const it of group.items) {
        const displayedImage = dishImage(it);
        productIds.push(it.id);
        products.push({
          id: it.id,
          category: it.category,
          section: group.title,
          position: position++,
          name: it.name,
          description: it.description,
          priceMAD: it.priceMAD,
          displayedPriceMAD: lowestPriceMAD(it),
          currency: it.currency,
          image: it.image,
          displayedImage,
          thumbs: dishThumbs(displayedImage),
          variants: (it.variants ?? []).map((v) => ({ id: v.id, label: v.label, priceMAD: v.priceMAD })),
        });
      }
    }
    categories.push({ name: category, position: categories.length, productIds });
  }

  return { categories, products };
}

/**
 * Compare deux modèles et liste les écarts lisibles (vide = parité parfaite).
 * `expected` = référence (ex. statique), `actual` = source testée (ex. Supabase).
 */
export function compareParityModels(expected: MenuParityModel, actual: MenuParityModel): string[] {
  const diffs: string[] = [];

  const expCats = expected.categories.map((c) => c.name);
  const actCats = actual.categories.map((c) => c.name);
  if (JSON.stringify(expCats) !== JSON.stringify(actCats)) {
    diffs.push(`catégories : attendu [${expCats.join(", ")}], obtenu [${actCats.join(", ")}]`);
  }

  const actCatByName = new Map(actual.categories.map((c) => [c.name, c]));
  for (const c of expected.categories) {
    const a = actCatByName.get(c.name);
    if (a && JSON.stringify(a.productIds) !== JSON.stringify(c.productIds)) {
      diffs.push(`ordre des plats dans « ${c.name} » différent`);
    }
  }

  const actById = new Map(actual.products.map((p) => [p.id, p]));
  const expIds = new Set(expected.products.map((p) => p.id));
  for (const p of expected.products) {
    const a = actById.get(p.id);
    if (!a) {
      diffs.push(`plat manquant : ${p.id} (${p.name})`);
      continue;
    }
    for (const key of Object.keys(p) as (keyof ParityProduct)[]) {
      const ev = JSON.stringify(p[key]);
      const av = JSON.stringify(a[key]);
      if (ev !== av) diffs.push(`${p.id} (${p.name}) · ${key} : attendu ${ev}, obtenu ${av}`);
    }
  }
  for (const a of actual.products) {
    if (!expIds.has(a.id)) diffs.push(`plat en trop : ${a.id} (${a.name})`);
  }

  return diffs;
}
