/**
 * Sections des formules (Admin → Formules) : CRUD via RPC dédiées, sans paralléliser
 * l'architecture catalogue. Les offres restent dans la catégorie formules-promos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { FORMULES_CATEGORY_ID } from "../../data/formulesPromos";
import { categorySlug } from "../../data/menuRows";
import { saveErrorMessage } from "./productEditor";

export const FORMULE_SECTION_NAME_MAX = 60;
export const FORMULE_SECTION_DESCRIPTION_MAX = 160;

export type FormuleSectionRow = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

export type FormuleSectionAssignment = {
  productId: string;
  sectionId: string | null;
};

function rpcError(error: { message: string; code?: string }): string {
  if (error.code === "PGRST202" || /could not find the function|relation .* does not exist|column .* does not exist/i.test(error.message)) {
    return "Les sections de formules ne sont pas encore installées sur Supabase (migration formule_sections / 08_formule_sections.sql).";
  }
  return saveErrorMessage(error);
}

function normalizeSectionRow(row: Record<string, unknown>): FormuleSectionRow {
  const desc = row.description;
  return {
    id: String(row.id),
    name: String(row.name),
    description: typeof desc === "string" && desc.trim() !== "" ? desc.trim() : null,
    sort_order: Number(row.sort_order),
    is_active: Boolean(row.is_active),
  };
}

/** null = table absente ou illisible (migration non appliquée). */
export async function fetchFormuleSections(client: SupabaseClient): Promise<FormuleSectionRow[] | null> {
  let data: unknown[] | null = null;
  let error: { message: string } | null = null;
  const withDesc = await client
    .from("formule_sections")
    .select("id, name, description, sort_order, is_active")
    .order("sort_order");
  if (withDesc.error && /description|column/i.test(withDesc.error.message)) {
    // Colonne description absente (09 pas encore appliqué) : repli sans description.
    const fallback = await client.from("formule_sections").select("id, name, sort_order, is_active").order("sort_order");
    data = fallback.data;
    error = fallback.error;
  } else {
    data = withDesc.data;
    error = withDesc.error;
  }
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => normalizeSectionRow(row as Record<string, unknown>));
}

/** Affectations section pour les formules ; null si colonne absente. */
export async function fetchFormuleSectionAssignments(client: SupabaseClient): Promise<FormuleSectionAssignment[] | null> {
  const { data, error } = await client
    .from("products")
    .select("id, formule_section_id")
    .eq("category_id", FORMULES_CATEGORY_ID);
  if (error) {
    if (/does not exist|schema cache|formule_section_id/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => ({
    productId: row.id as string,
    sectionId: (row.formule_section_id as string | null) ?? null,
  }));
}

export function orderedFormuleSections(sections: readonly FormuleSectionRow[]): FormuleSectionRow[] {
  return [...sections].sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function formuleSectionProductCount(assignments: readonly FormuleSectionAssignment[], sectionId: string): number {
  return assignments.filter((a) => a.sectionId === sectionId).length;
}

export type FormuleSectionRank = { position: number; total: number };

/**
 * Rang 1…N dans une section (ou liste déjà filtrée), indépendant des autres sections.
 * `orderedIds` doit être trié comme en base (sort_order, puis id).
 */
export function ranksInOrderedGroup(orderedIds: readonly string[]): Map<string, FormuleSectionRank> {
  const total = orderedIds.length;
  const ranks = new Map<string, FormuleSectionRank>();
  orderedIds.forEach((id, i) => ranks.set(id, { position: i + 1, total }));
  return ranks;
}

/** Position cible (1…N de la section), ou null si le déplacement est impossible. */
export function sectionMoveTarget(
  position: number,
  total: number,
  direction: "up" | "down",
): number | null {
  const target = direction === "up" ? position - 1 : position + 1;
  return target >= 1 && target <= total ? target : null;
}

export function formuleSectionNameError(
  name: string,
  sections: readonly FormuleSectionRow[],
  selfId: string | null = null,
): string | null {
  const v = name.trim();
  if (v === "") return "Le nom de la section est obligatoire.";
  if (v.length > FORMULE_SECTION_NAME_MAX) return `Nom trop long (${FORMULE_SECTION_NAME_MAX} caractères maximum).`;
  if (categorySlug(v) === "") return "Le nom doit contenir au moins une lettre ou un chiffre.";
  const others = sections.filter((s) => s.id !== selfId);
  if (others.some((s) => s.name.trim().toLowerCase() === v.toLowerCase())) return "Une section porte déjà ce nom.";
  return null;
}

export function formuleSectionDescriptionError(description: string): string | null {
  const v = description.trim();
  if (v.length > FORMULE_SECTION_DESCRIPTION_MAX) {
    return `Description trop longue (${FORMULE_SECTION_DESCRIPTION_MAX} caractères maximum).`;
  }
  return null;
}

/** Position humaine 1…N parmi les sections ordonnées. */
export function formuleSectionPosition(sections: readonly FormuleSectionRow[], sectionId: string): number {
  return orderedFormuleSections(sections).findIndex((s) => s.id === sectionId) + 1;
}

export function newFormuleSectionId(name: string, sections: readonly FormuleSectionRow[]): string {
  const base = categorySlug(name).slice(0, 60).replace(/-+$/, "") || "section";
  const taken = new Set(sections.map((s) => s.id));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

export function parseFormuleSectionPosition(value: string, max: number): number | string {
  const v = value.trim();
  if (v === "") return max;
  if (!/^\d+$/.test(v)) return `Indiquez une position entre 1 et ${max}.`;
  const n = Number(v);
  return n >= 1 && n <= max ? n : `Indiquez une position entre 1 et ${max}.`;
}

/**
 * Section d'affichage d'une offre : uniquement l'affectation persistée (formule_section_id).
 * Pas de repli heuristique — sinon l'admin et le site public divergent (doublons / mauvaises sections).
 */
export function resolveFormuleSectionId(
  _product: { id: string; name: string },
  sections: readonly FormuleSectionRow[],
  assignment: string | null | undefined,
): string | null {
  if (assignment && sections.some((s) => s.id === assignment)) return assignment;
  return null;
}

export type FormuleSectionActionResult =
  | { ok: true; section: FormuleSectionRow }
  | { ok: false; error: string };

export async function createFormuleSection(
  client: SupabaseClient,
  sections: readonly FormuleSectionRow[],
  input: { name: string; description?: string; isActive: boolean; position: number | null },
): Promise<FormuleSectionActionResult> {
  const name = input.name.trim();
  const description = (input.description ?? "").trim();
  const args: Record<string, unknown> = {
    p_id: newFormuleSectionId(name, sections),
    p_name: name,
    p_is_active: input.isActive,
    p_position: input.position,
  };
  // p_description : signature 09 ; si absente, création puis update description.
  if (description) args.p_description = description;
  let { data, error } = await client.rpc("admin_create_formule_section", args);
  if (error && description && /p_description|could not find the function|PGRST202/i.test(error.message)) {
    const created = await client.rpc("admin_create_formule_section", {
      p_id: args.p_id,
      p_name: name,
      p_is_active: input.isActive,
      p_position: input.position,
    });
    if (created.error) return { ok: false, error: rpcError(created.error) };
    const updated = await updateFormuleSection(client, String(args.p_id), { description });
    if (!updated.ok) return updated;
    return { ok: true, section: updated.section };
  }
  if (error) return { ok: false, error: rpcError(error) };
  return { ok: true, section: normalizeSectionRow(data as Record<string, unknown>) };
}

export async function updateFormuleSection(
  client: SupabaseClient,
  sectionId: string,
  changes: { name?: string; description?: string | null; isActive?: boolean; position?: number },
): Promise<FormuleSectionActionResult> {
  const p_changes: Record<string, unknown> = {};
  if (changes.name !== undefined) p_changes.name = changes.name.trim();
  if (changes.isActive !== undefined) p_changes.is_active = changes.isActive;
  if (changes.description !== undefined) {
    p_changes.description = changes.description === null ? null : String(changes.description).trim();
  }
  const { data, error } = await client.rpc("admin_update_formule_section", {
    p_section_id: sectionId,
    p_changes,
    p_position: changes.position ?? null,
  });
  if (error) return { ok: false, error: rpcError(error) };
  return { ok: true, section: normalizeSectionRow(data as Record<string, unknown>) };
}

export async function deleteFormuleSection(
  client: SupabaseClient,
  sectionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client.rpc("admin_delete_formule_section", { p_section_id: sectionId });
  if (error) return { ok: false, error: rpcError(error) };
  return { ok: true };
}

export async function setFormuleSection(
  client: SupabaseClient,
  productId: string,
  sectionId: string,
  position: number | null = null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client.rpc("admin_set_formule_section", {
    p_product_id: productId,
    p_section_id: sectionId,
    p_position: position,
  });
  if (error) return { ok: false, error: rpcError(error) };
  return { ok: true };
}

export function deleteFormuleSectionBlockedMessage(count: number): string {
  return count === 1
    ? "Cette section contient 1 offre. Déplacez-la avant de la supprimer."
    : `Cette section contient ${count} offres. Déplacez-les avant de la supprimer.`;
}
