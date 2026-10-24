/**
 * Formules publiées : lues dans Supabase (catégorie formules-promos) et posées sur le menu
 * statique, sans remplacer les autres catégories. Sans catégorie en base, le menu statique reste.
 * L'affichage public découpe la catégorie unique en sections (même carrousel, même design).
 * Les noms de sections peuvent venir de formule_sections dès que la migration est appliquée.
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
};

export type FormuleProductRow = ProductRow & { formule_section_id?: string | null };

/**
 * null : catégorie absente ou lecture impossible → conserver les affiches statiques.
 * tableau : source Supabase (éventuellement vide si tout est désactivé).
 * Si `sections` est fourni, le libellé de catégorie de chaque offre est le nom de sa section.
 */
export function publishedFormules(
  category: FormuleCategoryProbe,
  products: readonly FormuleProductRow[],
  sections: readonly FormuleSectionProbe[] | null = null,
): YumloMenuItem[] | null {
  if (!category || category.id !== FORMULES_CATEGORY_ID) return null;
  if (!category.is_active) return [];
  const activeSections = (sections ?? []).filter((s) => s.is_active);
  const sectionById = new Map(activeSections.map((s) => [s.id, s]));
  const sectionOrder = new Map(activeSections.map((s, i) => [s.id, i]));

  return [...products]
    .filter((p) => p.category_id === FORMULES_CATEGORY_ID && p.is_active)
    .sort((a, b) => {
      const sa = a.formule_section_id ? (sectionOrder.get(a.formule_section_id) ?? 999) : 999;
      const sb = b.formule_section_id ? (sectionOrder.get(b.formule_section_id) ?? 999) : 999;
      return sa - sb || a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    })
    .map((p) => {
      const sec = p.formule_section_id ? sectionById.get(p.formule_section_id) : undefined;
      return {
        id: p.id,
        category: sec?.name ?? FORMULES_PROMOS_CATEGORY,
        name: p.name,
        description: p.description ?? "",
        priceMAD: formatDbPrice(p.price),
        currency: p.currency || "MAD",
        image: p.image_url ?? "",
      };
    });
}

function sectionOrderList(menu: MenuSnapshot, placed: readonly YumloMenuItem[]): string[] {
  const preferred =
    menu.formuleSectionNames && menu.formuleSectionNames.length > 0
      ? [...menu.formuleSectionNames]
      : [...FORMULE_PUBLIC_SECTIONS];
  const present = preferred.filter((s) => placed.some((it) => it.category === s));
  const extras = [...new Set(placed.map((it) => it.category))].filter((c) => !present.includes(c));
  return [...present, ...extras];
}

/**
 * Découpe « Formules & Promos » (ou sections déjà nommées) en catégories publiques.
 * Les sections sans offre sont omises. Ids, noms, prix et images inchangés.
 * L'UI publique (FormulesCarousel) n'est pas modifiée : seuls les libellés de section changent.
 */
export function splitFormulesForPublicMenu(menu: MenuSnapshot): MenuSnapshot {
  const known = menu.formuleSectionNames ?? null;
  const isFormule = (c: string) => isFormuleCarouselCategory(c, known);
  const formuleItems = menu.items.filter((it) => isFormule(it.category));
  if (formuleItems.length === 0 && !menu.categories.some(isFormule)) {
    return menu;
  }
  const rest = menu.items.filter((it) => !isFormule(it.category));
  const otherCategories = menu.categories.filter((c) => !isFormule(c));
  const placed = formuleItems.map((it) => {
    if (it.category !== FORMULES_PROMOS_CATEGORY) return it;
    return { ...it, category: formulePublicCategory(it) };
  });
  const sections = sectionOrderList({ ...menu, formuleSectionNames: known ?? [...FORMULE_PUBLIC_SECTIONS] }, placed);
  return {
    ...menu,
    formuleSectionNames: sections,
    categories: [...sections, ...otherCategories],
    items: [...placed, ...rest],
  };
}

/**
 * Remplace uniquement les formules et place toujours les sections formules en tête du menu public.
 * (En source Supabase, sort_order 1000 la mettrait sinon en fin de liste.)
 * Les autres plats, leur ordre relatif et leurs champs restent intacts.
 */
export function replaceFormules(menu: MenuSnapshot, items: readonly YumloMenuItem[]): MenuSnapshot {
  const known = [
    ...new Set([
      ...(menu.formuleSectionNames ?? []),
      ...items.map((it) => it.category).filter((c) => c !== FORMULES_PROMOS_CATEGORY),
      ...FORMULE_PUBLIC_SECTIONS,
    ]),
  ];
  const isFormule = (c: string) => isFormuleCarouselCategory(c, known);
  const rest = menu.items.filter((it) => !isFormule(it.category));
  const otherCategories = menu.categories.filter((c) => !isFormule(c));
  const withItems: MenuSnapshot = {
    ...menu,
    formuleSectionNames: known,
    categories: items.length > 0 ? [FORMULES_PROMOS_CATEGORY, ...otherCategories] : otherCategories,
    items: [...items, ...rest],
  };
  return splitFormulesForPublicMenu(withItems);
}

/** Remonte les sections formules en tête (et les scinde si besoin). */
export function promoteFormulesCategory(menu: MenuSnapshot): MenuSnapshot {
  return splitFormulesForPublicMenu(menu);
}

/** Lecture publique (produits actifs seulement). null si Supabase n'est pas configuré ou si la catégorie n'existe pas. */
export async function fetchPublishedFormules(): Promise<YumloMenuItem[] | null> {
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

  const sectionsRes = await client
    .from("formule_sections")
    .select("id, name, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order");
  const sections =
    sectionsRes.error || !sectionsRes.data ? null : (sectionsRes.data as FormuleSectionProbe[]);

  const withSection = await client
    .from("products")
    .select(
      "id, category_id, name, description, price, currency, image_url, thumb_small_url, thumb_large_url, sort_order, is_active, formule_section_id",
    )
    .eq("category_id", FORMULES_CATEGORY_ID)
    .eq("is_active", true)
    .order("sort_order");

  if (!withSection.error && withSection.data) {
    return publishedFormules(category.data, withSection.data as FormuleProductRow[], sections);
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
  return publishedFormules(category.data, (products.data ?? []) as ProductRow[], null);
}
