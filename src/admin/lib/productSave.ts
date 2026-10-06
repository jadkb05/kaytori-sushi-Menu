/**
 * Édition complète d'un produit (Phase 3E) — enregistrée en UNE transaction par la RPC
 * admin_save_product : champs, photo, catégorie (avec position cible), position, liste finale
 * des variantes (ajouts / modifications / suppressions / ordre). Suppression : admin_delete_product.
 *
 * L'admin raisonne en positions humaines (1 = premier) pour les produits ET les variantes ;
 * les valeurs internes (sort_order) ne sont jamais montrées.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryRow, MenuRows, ProductRow, VariantRow } from "../../data/menuRows";
import { variantSlug } from "./productCreate";
import { parsePrice, saveErrorMessage, type PhotoSelection } from "./productEditor";

export type EditVariant = {
  /** Clé locale du formulaire. */
  key: string;
  /** Variante déjà enregistrée (son identifiant ne change jamais) ou null si nouvelle. */
  existingId: string | null;
  label: string;
  price: string;
  /** Position humaine : « 1 » = première variante proposée. */
  position: string;
  isActive: boolean;
};

export type CatalogForm = {
  name: string;
  description: string;
  /** Utilisé uniquement si le produit n'a (plus) aucune variante. */
  price: string;
  categoryId: string;
  isActive: boolean;
  /** Position humaine dans la catégorie choisie. */
  position: string;
  variants: EditVariant[];
};

export type CategorySlotInfo = {
  /** Positions possibles : 1…max. */
  max: number;
  /** Produits masqués comptés dans les positions. */
  hidden: number;
  automatic: boolean;
};

export type CatalogEditData = {
  product: ProductRow;
  variants: VariantRow[];
  categories: CategoryRow[];
  rows: MenuRows;
  /** Position actuelle (1 = premier) dans la catégorie actuelle. */
  currentPosition: number;
  form: CatalogForm;
};

const byDisplayOrder = (a: { sort_order: number; id: string }, b: { sort_order: number; id: string }) =>
  a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Positions possibles dans une catégorie pour ce produit : 1…N s'il y est déjà, 1…N+1 s'il y arrive.
 * Les produits masqués comptent (ils gardent leur place dans l'ordre) : le nombre est indiqué à l'admin.
 */
export function categorySlots(rows: MenuRows, categoryId: string, productId: string): CategorySlotInfo | null {
  const category = rows.categories.find((c) => c.id === categoryId);
  if (!category) return null;
  const members = rows.products.filter((p) => p.category_id === categoryId);
  const isMember = members.some((p) => p.id === productId);
  return {
    max: members.length + (isMember ? 0 : 1),
    hidden: members.filter((p) => !p.is_active && p.id !== productId).length,
    automatic: category.display_mode !== "list",
  };
}

export function loadCatalogEdit(rows: MenuRows, productId: string): CatalogEditData | null {
  const product = rows.products.find((p) => p.id === productId);
  if (!product) return null;
  const variants = rows.variants.filter((v) => v.product_id === productId).sort(byDisplayOrder);
  const siblings = rows.products.filter((p) => p.category_id === product.category_id).sort(byDisplayOrder);
  const currentPosition = siblings.findIndex((p) => p.id === productId) + 1;
  return {
    product,
    variants,
    categories: [...rows.categories].sort((a, b) => a.sort_order - b.sort_order),
    rows,
    currentPosition,
    form: {
      name: product.name,
      description: product.description ?? "",
      price: Number(product.price).toFixed(2),
      categoryId: product.category_id,
      isActive: product.is_active,
      position: String(currentPosition),
      variants: variants.map((v, i) => ({
        key: `e:${v.id}`,
        existingId: v.id,
        label: v.label,
        price: Number(v.price).toFixed(2),
        position: String(i + 1),
        isActive: v.is_active,
      })),
    },
  };
}

/** Identifiant définitif d'une variante : existant inchangé, ou dérivé du libellé (« Bœuf » → « boeuf »). */
export function variantFinalId(v: EditVariant): string {
  return v.existingId ?? variantSlug(v.label);
}

/** Variantes dans l'ordre final : position saisie, puis ordre actuel du formulaire (déterministe). */
export function orderedVariants(variants: EditVariant[]): EditVariant[] {
  return variants
    .map((v, index) => ({ v, index, pos: Number(v.position.trim()) }))
    .sort((a, b) => (Number.isFinite(a.pos) ? a.pos : Infinity) - (Number.isFinite(b.pos) ? b.pos : Infinity) || a.index - b.index)
    .map(({ v }) => v);
}

export type CatalogErrors = {
  name?: string;
  price?: string;
  categoryId?: string;
  position?: string;
  variants: Record<string, { label?: string; price?: string; position?: string }>;
};

export function hasCatalogErrors(e: CatalogErrors): boolean {
  return Boolean(e.name || e.price || e.categoryId || e.position || Object.keys(e.variants).length > 0);
}

function positionMessage(input: string, max: number): string | null {
  const s = input.trim();
  if (s === "") return "Indiquez une position.";
  if (!/^-?\d+$/.test(s)) return "Position invalide : nombre entier (1, 2, 3…).";
  const n = Number(s);
  if (n < 1) return "La position minimum est 1.";
  if (n > max) return `La position maximum est ${max}.`;
  return null;
}

export function validateCatalogForm(form: CatalogForm, data: CatalogEditData): CatalogErrors {
  const errors: CatalogErrors = { variants: {} };
  if (form.name.trim() === "") errors.name = "Le nom est obligatoire.";
  const slots = categorySlots(data.rows, form.categoryId, data.product.id);
  if (!slots) errors.categoryId = "Choisissez une catégorie existante.";
  if (form.variants.length === 0 && parsePrice(form.price) === null) {
    errors.price = "Prix invalide : nombre positif, 2 décimales maximum (ex. 69 ou 69,50).";
  }
  if (slots && !slots.automatic) {
    const e = positionMessage(form.position, slots.max);
    if (e) errors.position = e;
  }
  const seen = new Set<string>();
  for (const v of form.variants) {
    const e: CatalogErrors["variants"][string] = {};
    const id = variantFinalId(v);
    if (v.label.trim() === "" || id === "") e.label = "Le libellé est obligatoire.";
    else if (seen.has(id)) e.label = "Cette variante existe déjà.";
    else seen.add(id);
    if (parsePrice(v.price) === null) e.price = "Prix invalide.";
    const pe = positionMessage(v.position, form.variants.length);
    if (pe) e.position = pe;
    if (Object.keys(e).length > 0) errors.variants[v.key] = e;
  }
  return errors;
}

export type SaveRequest = {
  p_product_id: string;
  p_product: Partial<{ name: string; description: string; price: number; category_id: string; is_active: boolean; image_url: string }>;
  /** null = variantes inchangées ; sinon liste finale ordonnée. */
  p_variants: Array<{ id: string; label: string; price: number; is_active: boolean }> | null;
  p_position: number | null;
};

const variantSignature = (list: SaveRequest["p_variants"]) => JSON.stringify(list);

/** Données envoyées (formulaire validé) : uniquement ce qui change. */
export function buildSaveRequest(data: CatalogEditData, form: CatalogForm, imageUrl: string | null = null): SaveRequest {
  const p = data.product;
  const product: SaveRequest["p_product"] = {};
  const name = form.name.trim();
  if (name !== p.name) product.name = name;
  if (form.description !== (p.description ?? "")) product.description = form.description;
  if (form.categoryId !== p.category_id) product.category_id = form.categoryId;
  if (form.isActive !== p.is_active) product.is_active = form.isActive;
  if (imageUrl) product.image_url = imageUrl;

  const finalVariants = orderedVariants(form.variants).map((v) => ({
    id: variantFinalId(v),
    label: v.label.trim(),
    price: parsePrice(v.price)!,
    is_active: v.isActive,
  }));
  const originalVariants = data.variants.map((v) => ({ id: v.id, label: v.label, price: Number(v.price), is_active: v.is_active }));
  const variantsChanged = variantSignature(finalVariants) !== variantSignature(originalVariants);

  if (finalVariants.length === 0) {
    const price = parsePrice(form.price)!;
    if (price !== Number(p.price)) product.price = price;
  }

  const slots = categorySlots(data.rows, form.categoryId, p.id);
  let position: number | null = null;
  if (slots && !slots.automatic) {
    const wanted = Number(form.position.trim());
    const moving = form.categoryId !== p.category_id;
    if (moving || wanted !== data.currentPosition) position = wanted;
  }

  return { p_product_id: p.id, p_product: product, p_variants: variantsChanged ? finalVariants : null, p_position: position };
}

export function isEmptySaveRequest(r: SaveRequest): boolean {
  return Object.keys(r.p_product).length === 0 && r.p_variants === null && r.p_position === null;
}

/** Formulaire modifié si UN élément change (champ, position, variante, photo). */
export function isCatalogDirty(original: CatalogForm, current: CatalogForm, photo: PhotoSelection | null): boolean {
  return photo !== null || JSON.stringify(original) !== JSON.stringify(current);
}

type UploadPhoto = (
  client: SupabaseClient,
  productId: string,
  file: File,
) => Promise<{ ok: true; path: string; publicUrl: string } | { ok: false; error: string }>;

export type CatalogSaveResult =
  | { ok: true; name: string }
  | { ok: false; error: string; failedStep: "photo" | "save"; uploadedPath: string | null };

/**
 * 1. Photo (si choisie) : téléversement Storage, aucune écriture en base — échec → rien n'est modifié.
 * 2. admin_save_product : UNE transaction (champs + photo + catégorie + position + variantes + journal).
 *    Échec → la base est intacte ; le fichier éventuellement téléversé est conservé et signalé.
 */
export async function saveCatalogProduct(
  client: SupabaseClient,
  data: CatalogEditData,
  form: CatalogForm,
  photo: File | null,
  uploadPhoto: UploadPhoto,
): Promise<CatalogSaveResult> {
  let uploaded: { path: string; publicUrl: string } | null = null;
  if (photo) {
    const up = await uploadPhoto(client, data.product.id, photo);
    if (!up.ok) return { ok: false, error: up.error, failedStep: "photo", uploadedPath: null };
    uploaded = up;
  }
  const request = buildSaveRequest(data, form, uploaded?.publicUrl ?? null);
  const { data: saved, error } = await client.rpc("admin_save_product", request);
  if (error) {
    const message =
      error.code === "PGRST202" || /could not find the function/i.test(error.message)
        ? "La fonction d'enregistrement n'est pas installée sur Supabase (migration admin_catalog)."
        : saveErrorMessage(error);
    return { ok: false, error: message, failedStep: "save", uploadedPath: uploaded?.path ?? null };
  }
  return { ok: true, name: (saved as { product: { name: string } }).product.name };
}

/** Suppression définitive (produit + variantes), produits suivants remontés. */
export async function deleteCatalogProduct(client: SupabaseClient, productId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client.rpc("admin_delete_product", { p_product_id: productId });
  if (!error) return { ok: true };
  if (error.code === "PGRST202" || /could not find the function/i.test(error.message)) {
    return { ok: false, error: "Impossible de supprimer ce produit : fonction non installée sur Supabase (migration admin_catalog)." };
  }
  return { ok: false, error: `Impossible de supprimer ce produit. ${saveErrorMessage(error)}` };
}
