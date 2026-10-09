/**
 * Ordre des produits depuis la liste de l'admin (flèches ↑ / ↓).
 *
 * Un produit ne bouge que DANS sa catégorie : la RPC admin_save_product reçoit uniquement la
 * position cible (aucun champ produit, donc jamais category_id) et décale les voisins de la
 * même catégorie dans une transaction, avec contrôle admin, RLS et journal (product.update).
 * La position est celle de la catégorie complète (masqués compris), jamais celle de la liste
 * filtrée. Pas d'ordre « optimiste » : l'écran est relu depuis la base après chaque tentative.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminProduct } from "./menuAdmin";
import { saveErrorMessage } from "./productEditor";

export type MoveDirection = "up" | "down";

type OrderedProduct = Pick<AdminProduct, "id" | "name" | "position" | "categoryTotal" | "manualOrder">;

/** Position cible (1…N de la catégorie), ou null si le déplacement est impossible. */
export function moveTarget(p: OrderedProduct, direction: MoveDirection): number | null {
  if (!p.manualOrder) return null;
  const target = direction === "up" ? p.position - 1 : p.position + 1;
  return target >= 1 && target <= p.categoryTotal ? target : null;
}

export type MoveResult = { ok: true; position: number } | { ok: false; error: string };

/** Enregistre le déplacement par la RPC sécurisée existante. */
export async function moveProduct(client: SupabaseClient, p: OrderedProduct, direction: MoveDirection): Promise<MoveResult> {
  const position = moveTarget(p, direction);
  if (position === null) {
    return { ok: false, error: p.manualOrder ? `« ${p.name} » est déjà en ${direction === "up" ? "première" : "dernière"} position.` : "Cette catégorie utilise un ordre automatique." };
  }
  const { error } = await client.rpc("admin_save_product", { p_product_id: p.id, p_product: {}, p_variants: null, p_position: position });
  if (!error) return { ok: true, position };
  if (error.code === "PGRST202" || /could not find the function/i.test(error.message)) {
    return { ok: false, error: "Impossible de déplacer ce produit : fonction non installée sur Supabase (migration admin_catalog)." };
  }
  return { ok: false, error: `Impossible de déplacer « ${p.name} ». ${saveErrorMessage(error)}` };
}

export type MoveNotice = { success?: string; error?: string };

/**
 * Clic sur une flèche : enregistre, puis relit la base dans tous les cas (succès : ordre réel ;
 * échec : l'ordre enregistré reste affiché, rien d'optimiste à annuler).
 */
export async function runProductMove(
  client: SupabaseClient,
  p: OrderedProduct & Pick<AdminProduct, "categoryName">,
  direction: MoveDirection,
  refresh: () => Promise<boolean>,
): Promise<MoveNotice> {
  const res = await moveProduct(client, p, direction);
  const refreshed = await refresh();
  if (!res.ok) return { error: res.error };
  if (!refreshed) return { error: `« ${p.name} » a été déplacé, mais la liste n'a pas pu être rechargée. Actualisez la page.` };
  return { success: `« ${p.name} » déplacé en position ${res.position} dans « ${p.categoryName} ».` };
}
