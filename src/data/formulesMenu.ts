/**
 * Formules publiées : lues dans Supabase (catégorie formules-promos) et posées sur le menu
 * statique, sans remplacer les autres catégories.
 *
 * Mode dynamique (formule_sections disponible) :
 *   - regroupement strict par formule_section_id → nom actuel de la section ;
 *   - remplace intégralement l'affichage formules précédent (statique / heuristique) ;
 *   - jamais de section fantôme « Formules & Promos » ni de mélange avec Solo/Promo hardcodés.
 *
 * Mode repli (table sections absente ou fetch formules impossible) :
 *   - formulePublicCategory (Solo/Duo/Family, Midi, Promo) sur le menu statique uniquement.
 */
import type { YumloMenuItem } from "./yumloMenu";
import {
  FORMULE_PUBLIC_SECTIONS,
  FORMULES_CATEGORY_ID,
  FORMULES_PROMOS_CATEGORY,
  formulePublicCategory,
  isFormuleCarouselCategory,
} from "./formulesPromos";
import { formatDbPrice, type ProductRow } from "./menuRows";
import type { MenuSnapshot } from "./menuSource";

export type FormuleCategoryProbe = { id: string; is_active: boolean } | null;

export type FormuleSectionProbe = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  description?: string | null;
};

/** Map nom de section → description (uniquement si non vide). */
export function formuleSectionDescriptionMap(
  sections: readonly FormuleSectionProbe[],
  namesWithProducts: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of sections) {
    if (!s.is_active || !namesWithProducts.includes(s.name)) continue;
    const d = (s.description ?? "").trim();
    if (d) out[s.name] = d;
  }
  return out;
}

export type FormuleProductRow = ProductRow & { formule_section_id?: string | null };

/** Résultat du fetch public : sections non null = source dynamique qui remplace le statique. */
export type PublishedFormulesResult = {
  items: YumloMenuItem[];
  sections: FormuleSectionProbe[] | null;
};

/**
 * null : catégorie absente → conserver le menu statique.
 * Si `sections` est fourni (même vide) : mode dynamique — seules les offres avec un
 * formule_section_id valide sont publiées, sous le nom actuel de leur section.
 */
export function publishedFormules(
  category: FormuleCategoryProbe,
  products: readonly FormuleProductRow[],
  sections: readonly FormuleSectionProbe[] | null = null,
): YumloMenuItem[] | null {
  if (!category || category.id !== FORMULES_CATEGORY_ID) return null;
  if (!category.is_active) return [];

  if (sections !== null) {
    const activeSections = sections.filter((s) => s.is_active);
    const sectionById = new Map(activeSections.map((s) => [s.id, s]));
    const sectionOrder = new Map(activeSections.map((s, i) => [s.id, i]));

    return [...products]
      .filter((p) => p.category_id === FORMULES_CATEGORY_ID && p.is_active)
      .filter((p) => Boolean(p.formule_section_id && sectionById.has(p.formule_section_id)))
      .sort((a, b) => {
        const sa = sectionOrder.get(a.formule_section_id!) ?? 999;
        const sb = sectionOrder.get(b.formule_section_id!) ?? 999;
        return sa - sb || a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      })
      .map((p) => {
        const sec = sectionById.get(p.formule_section_id!)!;
        return {
          id: p.id,
          category: sec.name,
          name: p.name,
          description: p.description ?? "",
          priceMAD: formatDbPrice(p.price),
          currency: p.currency || "MAD",
          image: p.image_url ?? "",
          formuleSectionId: p.formule_section_id ?? null,
        };
      });
  }

  // Sans table sections : une seule catégorie catalogue (scindée ensuite par heuristique).
  return [...products]
    .filter((p) => p.category_id === FORMULES_CATEGORY_ID && p.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((p) => ({
      id: p.id,
      category: FORMULES_PROMOS_CATEGORY,
      name: p.name,
      description: p.description ?? "",
      priceMAD: formatDbPrice(p.price),
      currency: p.currency || "MAD",
      image: p.image_url ?? "",
    }));
}

function sectionOrderList(placed: readonly YumloMenuItem[], preferred: readonly string[]): string[] {
  const present = preferred.filter((s) => placed.some((it) => it.category === s));
  const extras = [...new Set(placed.map((it) => it.category))].filter((c) => !present.includes(c));
  return [...present, ...extras];
}

/** Tous les libellés formules à retirer du menu avant un remplacement dynamique. */
function formuleCategoryNamesToStrip(
  menu: MenuSnapshot,
  incomingSectionNames: readonly string[],
): Set<string> {
  return new Set([
    FORMULES_PROMOS_CATEGORY,
    ...FORMULE_PUBLIC_SECTIONS,
    ...(menu.formuleSectionNames ?? []),
    ...incomingSectionNames,
    // Anciens libellés éventuels encore présents dans les catégories du menu.
    ...menu.categories.filter((c) => isFormuleCarouselCategory(c, menu.formuleSectionNames)),
  ]);
}

/**
 * Découpe heuristique (menu statique / pas de formule_sections).
 */
export function splitFormulesForPublicMenu(menu: MenuSnapshot): MenuSnapshot {
  const strip = formuleCategoryNamesToStrip(menu, []);
  const isFormule = (c: string) => strip.has(c) || isFormuleCarouselCategory(c, menu.formuleSectionNames);
  const formuleItems = menu.items.filter((it) => isFormule(it.category));
  if (formuleItems.length === 0 && !menu.categories.some(isFormule)) {
    return menu;
  }
  const rest = menu.items.filter((it) => !isFormule(it.category));
  const otherCategories = menu.categories.filter((c) => !isFormule(c));
  const placed = formuleItems.map((it) => ({
    ...it,
    category: formulePublicCategory(it),
  }));
  const sections = sectionOrderList(placed, FORMULE_PUBLIC_SECTIONS);
  return {
    ...menu,
    formuleSectionNames: sections,
    formuleSectionDescriptions: undefined,
    categories: [...sections, ...otherCategories],
    items: [...placed, ...rest],
  };
}

/**
 * Remplace les formules du menu.
 * - `sections !== null` : mode dynamique — remplacement intégral, ordre = sort_order Supabase,
 *   aucune section « Formules & Promos », aucun mélange avec l'heuristique.
 * - `sections === null` : repli heuristique (statique).
 */
export function replaceFormules(
  menu: MenuSnapshot,
  items: readonly YumloMenuItem[],
  sections: readonly FormuleSectionProbe[] | null = null,
): MenuSnapshot {
  const incomingIds = new Set(items.map((it) => it.id));

  if (sections !== null) {
    const activeOrdered = [...sections]
      .filter((s) => s.is_active)
      .sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const sectionNames = activeOrdered.map((s) => s.name);
    const namesWithProducts = sectionNames.filter((n) => items.some((it) => it.category === n));
    const strip = formuleCategoryNamesToStrip(menu, sectionNames);

    const rest = menu.items.filter((it) => !incomingIds.has(it.id) && !strip.has(it.category));
    const otherCategories = menu.categories.filter((c) => !strip.has(c));

    return {
      ...menu,
      formuleSectionNames: namesWithProducts,
      formuleSectionDescriptions: formuleSectionDescriptionMap(activeOrdered, namesWithProducts),
      categories: [...namesWithProducts, ...otherCategories],
      items: [...items, ...rest],
    };
  }

  // Repli : aucune métadonnée de section → heuristique sur le catalogue unifié.
  const strip = formuleCategoryNamesToStrip(menu, []);
  const rest = menu.items.filter((it) => !incomingIds.has(it.id) && !strip.has(it.category));
  const otherCategories = menu.categories.filter((c) => !strip.has(c));

  return splitFormulesForPublicMenu({
    ...menu,
    formuleSectionNames: undefined,
    categories: items.length > 0 ? [FORMULES_PROMOS_CATEGORY, ...otherCategories] : otherCategories,
    items: [
      ...items.map((it) => ({ ...it, category: FORMULES_PROMOS_CATEGORY })),
      ...rest,
    ],
  });
}

/** Remonte / scinde les formules (heuristique — menu sans overlay dynamique). */
export function promoteFormulesCategory(menu: MenuSnapshot): MenuSnapshot {
  return splitFormulesForPublicMenu(menu);
}

/**
 * Lecture publique. null = indisponibilité réelle → garder le menu déjà chargé (statique).
 * Si la table formule_sections est lisible, `sections` est un tableau (éventuellement vide)
 * et remplace intégralement l'affichage formules précédent.
 */
export async function fetchPublishedFormules(): Promise<PublishedFormulesResult | null> {
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) return null;
  const { getSupabaseClient } = await import("../lib/supabase/client");
  const client = getSupabaseClient();
  if (!client) return null;

  const category = await client
    .from("categories")
    .select("id, is_active")
    .eq("id", FORMULES_CATEGORY_ID)
    .maybeSingle();
  if (category.error || !category.data) return null;

  let sectionsData: unknown[] | null = null;
  let sectionsError: { message: string } | null = null;
  const withDesc = await client
    .from("formule_sections")
    .select("id, name, description, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order");
  if (withDesc.error && /description|column/i.test(withDesc.error.message)) {
    const fallback = await client
      .from("formule_sections")
      .select("id, name, sort_order, is_active")
      .eq("is_active", true)
      .order("sort_order");
    sectionsData = fallback.data;
    sectionsError = fallback.error;
  } else {
    sectionsData = withDesc.data;
    sectionsError = withDesc.error;
  }

  const sectionsAvailable = !sectionsError;
  const sections = sectionsAvailable ? ((sectionsData ?? []) as FormuleSectionProbe[]) : null;

  if (sectionsAvailable) {
    const withSection = await client
      .from("products")
      .select(
        "id, category_id, name, description, price, currency, image_url, thumb_small_url, thumb_large_url, sort_order, is_active, formule_section_id",
      )
      .eq("category_id", FORMULES_CATEGORY_ID)
      .eq("is_active", true)
      .order("sort_order");
    if (withSection.error) return null;
    const items = publishedFormules(category.data, (withSection.data ?? []) as FormuleProductRow[], sections);
    if (items === null) return null;
    return { items, sections };
  }

  const products = await client
    .from("products")
    .select(
      "id, category_id, name, description, price, currency, image_url, thumb_small_url, thumb_large_url, sort_order, is_active",
    )
    .eq("category_id", FORMULES_CATEGORY_ID)
    .eq("is_active", true)
    .order("sort_order");
  if (products.error) return null;
  const items = publishedFormules(category.data, (products.data ?? []) as ProductRow[], null);
  if (items === null) return null;
  return { items, sections: null };
}
