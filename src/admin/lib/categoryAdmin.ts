/**
 * Gestion des catégories (/admin/categories) : création, renommage, masquer / afficher,
 * déplacement, suppression d'une catégorie vide. Chaque action = un appel RPC atomique
 * (admin_create_category, admin_update_category, admin_delete_category), journalisé en base.
 *
 * L'identifiant (slug) est fixé à la création et ne change jamais : produits et mode d'affichage
 * (tri Plats Thaï, Assortiments par pièces) y restent attachés après un renommage.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { categorySlug, type CategoryRow, type MenuRows } from "../../data/menuRows";
import { categoryAnchorId } from "../../menu/menuDisplay";
import { saveErrorMessage } from "./productEditor";

export const CATEGORY_NAME_MAX = 60;

/** Catégories dans l'ordre du menu (masquées comprises) : position humaine = index + 1. */
export function orderedCategories(rows: MenuRows): CategoryRow[] {
  return [...rows.categories].sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Nombre de produits rattachés (masqués compris) : la suppression exige 0. */
export function categoryProductCount(rows: MenuRows, categoryId: string): number {
  return rows.products.filter((p) => p.category_id === categoryId).length;
}

export function deleteBlockedMessage(count: number): string {
  return count === 1
    ? "Cette catégorie contient 1 produit. Déplacez-le avant de la supprimer."
    : `Cette catégorie contient ${count} produits. Déplacez-les avant de la supprimer.`;
}

/**
 * Erreur de nom, ou null. Unicité comme en base (casse / espaces ignorés) et aussi sur l'ancre du
 * menu public (« Plats Thai » et « Plats Thaï » donneraient le même lien #menu-cat-plats-thai).
 */
export function categoryNameError(name: string, rows: MenuRows, selfId: string | null = null): string | null {
  const v = name.trim();
  if (v === "") return "Le nom de la catégorie est obligatoire.";
  if (v.length > CATEGORY_NAME_MAX) return `Nom trop long (${CATEGORY_NAME_MAX} caractères maximum).`;
  if (categorySlug(v) === "") return "Le nom doit contenir au moins une lettre ou un chiffre.";
  const others = rows.categories.filter((c) => c.id !== selfId);
  if (others.some((c) => c.name.trim().toLowerCase() === v.toLowerCase())) return "Une catégorie porte déjà ce nom.";
  if (others.some((c) => categoryAnchorId(c.name) === categoryAnchorId(v))) {
    return "Un nom trop proche existe déjà (seuls les accents ou la ponctuation diffèrent).";
  }
  return null;
}

/** Identifiant stable d'une nouvelle catégorie : slug du nom (+ « -2 », « -3 »… si déjà pris). */
export function newCategoryId(name: string, rows: MenuRows): string {
  const base = categorySlug(name).slice(0, 60).replace(/-+$/, "");
  const taken = new Set(rows.categories.map((c) => c.id));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** Position saisie (1…max) ou message d'erreur. */
export function parseCategoryPosition(value: string, max: number): number | string {
  const v = value.trim();
  if (!/^\d+$/.test(v)) return `Indiquez une position entre 1 et ${max}.`;
  const n = Number(v);
  return n >= 1 && n <= max ? n : `Indiquez une position entre 1 et ${max}.`;
}

export type CategoryActionResult = { ok: true; category: CategoryRow } | { ok: false; error: string };

function rpcError(error: { message: string; code?: string }): string {
  if (error.code === "PGRST202" || /could not find the function/i.test(error.message)) {
    return "La gestion des catégories n'est pas installée sur Supabase (migration admin_categories).";
  }
  return saveErrorMessage(error);
}

export async function createCategory(
  client: SupabaseClient,
  rows: MenuRows,
  input: { name: string; isActive: boolean; position: number | null },
): Promise<CategoryActionResult> {
  const name = input.name.trim();
  const { data, error } = await client.rpc("admin_create_category", {
    p_id: newCategoryId(name, rows),
    p_name: name,
    p_is_active: input.isActive,
    p_position: input.position,
  });
  if (error) return { ok: false, error: rpcError(error) };
  return { ok: true, category: data as CategoryRow };
}

export async function updateCategory(
  client: SupabaseClient,
  categoryId: string,
  changes: { name?: string; isActive?: boolean; position?: number },
): Promise<CategoryActionResult> {
  const p_changes: Record<string, unknown> = {};
  if (changes.name !== undefined) p_changes.name = changes.name.trim();
  if (changes.isActive !== undefined) p_changes.is_active = changes.isActive;
  const { data, error } = await client.rpc("admin_update_category", {
    p_category_id: categoryId,
    p_changes,
    p_position: changes.position ?? null,
  });
  if (error) return { ok: false, error: rpcError(error) };
  return { ok: true, category: data as CategoryRow };
}

export async function deleteCategory(
  client: SupabaseClient,
  rows: MenuRows,
  categoryId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Vérification immédiate côté écran ; la base revérifie (produits masqués compris) dans la transaction.
  const count = categoryProductCount(rows, categoryId);
  if (count > 0) return { ok: false, error: deleteBlockedMessage(count) };
  const { error } = await client.rpc("admin_delete_category", { p_category_id: categoryId });
  if (error) return { ok: false, error: rpcError(error) };
  return { ok: true };
}
