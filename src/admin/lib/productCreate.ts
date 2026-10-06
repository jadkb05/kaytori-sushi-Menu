/**
 * Création d'un produit (Phase 3D) : formulaire, validation (photo obligatoire), position
 * humaine 1…N+1, puis : 1) téléversement de la photo (Storage, sans écriture en base),
 * 2) RPC admin_create_product = UNE transaction (produit + variantes + position + journal).
 * Un échec à n'importe quelle étape ne crée jamais de produit partiel.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryRow, MenuRows } from "../../data/menuRows";
import { parsePrice, parseSortOrder, positionError, saveErrorMessage } from "./productEditor";
import { validatePhotoFile } from "./productPhoto";

export type NewVariantForm = {
  /** Clé locale du formulaire (l'ID définitif est dérivé du libellé). */
  key: string;
  label: string;
  price: string;
  sortOrder: string;
  isActive: boolean;
};

export type NewProductForm = {
  name: string;
  description: string;
  categoryId: string;
  /** Ignoré si le produit a des variantes (prix parent = prix de variante le plus bas). */
  price: string;
  isActive: boolean;
  /** Position humaine 1…N+1 (catégories à ordre manuel uniquement). */
  position: string;
  variants: NewVariantForm[];
};

export type CategoryInsertInfo = {
  /** Nombre de produits actuels de la catégorie (N) : positions possibles 1…N+1. */
  count: number;
  automatic: boolean;
};

export function categoryInsertInfo(rows: MenuRows, categoryId: string): CategoryInsertInfo | null {
  const category = rows.categories.find((c) => c.id === categoryId);
  if (!category) return null;
  return {
    count: rows.products.filter((p) => p.category_id === categoryId).length,
    automatic: category.display_mode !== "list",
  };
}

export function emptyNewProductForm(categories: CategoryRow[], rows: MenuRows): NewProductForm {
  const first = [...categories].sort((a, b) => a.sort_order - b.sort_order)[0];
  const info = first ? categoryInsertInfo(rows, first.id) : null;
  return {
    name: "",
    description: "",
    categoryId: first?.id ?? "",
    price: "",
    isActive: true,
    position: String((info?.count ?? 0) + 1), // par défaut : en dernier
    variants: [],
  };
}

/** Nouvel ID produit : 10 caractères hexadécimaux (même format que les 214 produits existants). */
export function newProductId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** ID de variante dérivé du libellé, comme les variantes existantes (« Bœuf » → « boeuf »). */
export function variantSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export type NewProductErrors = {
  name?: string;
  categoryId?: string;
  price?: string;
  position?: string;
  photo?: string;
  variants: Record<string, { label?: string; price?: string; sortOrder?: string }>;
};

export function hasNewProductErrors(e: NewProductErrors): boolean {
  return Boolean(e.name || e.categoryId || e.price || e.position || e.photo || Object.keys(e.variants).length > 0);
}

export function validateNewProduct(
  form: NewProductForm,
  rows: MenuRows,
  photo: { type: string; size: number } | null,
): NewProductErrors {
  const errors: NewProductErrors = { variants: {} };
  if (form.name.trim() === "") errors.name = "Le nom est obligatoire.";
  const info = categoryInsertInfo(rows, form.categoryId);
  if (!info) errors.categoryId = "Choisissez une catégorie existante.";
  if (form.variants.length === 0 && parsePrice(form.price) === null) {
    errors.price = "Prix invalide : nombre positif, 2 décimales maximum (ex. 69 ou 69,50).";
  }
  if (info && !info.automatic) {
    const e = positionError(form.position, info.count + 1);
    if (e) errors.position = e.replace("(nombre de produits de la catégorie)", "(fin de la catégorie)");
  }
  if (!photo) errors.photo = "La photo est obligatoire pour créer un produit.";
  else {
    const e = validatePhotoFile(photo);
    if (e) errors.photo = e;
  }
  const seen = new Map<string, string>();
  for (const v of form.variants) {
    const e: NewProductErrors["variants"][string] = {};
    const slug = variantSlug(v.label);
    if (v.label.trim() === "" || slug === "") e.label = "Le libellé est obligatoire.";
    else if (seen.has(slug)) e.label = `Libellé déjà utilisé par une autre variante (« ${seen.get(slug)} »).`;
    else seen.set(slug, v.label.trim());
    if (parsePrice(v.price) === null) e.price = "Prix invalide.";
    if (parseSortOrder(v.sortOrder) === null) e.sortOrder = "Ordre invalide.";
    if (Object.keys(e).length > 0) errors.variants[v.key] = e;
  }
  return errors;
}

export type CreatePayload = {
  p_product: {
    id: string;
    name: string;
    description: string;
    category_id: string;
    is_active: boolean;
    image_url: string;
    price?: number;
  };
  p_variants: Array<{ id: string; label: string; price: number; sort_order: number; is_active: boolean }>;
  p_position: number | null;
};

/** Données envoyées à admin_create_product (formulaire déjà validé). */
export function buildCreatePayload(form: NewProductForm, rows: MenuRows, productId: string, imageUrl: string): CreatePayload {
  const info = categoryInsertInfo(rows, form.categoryId)!;
  const product: CreatePayload["p_product"] = {
    id: productId,
    name: form.name.trim(),
    description: form.description,
    category_id: form.categoryId,
    is_active: form.isActive,
    image_url: imageUrl,
  };
  if (form.variants.length === 0) product.price = parsePrice(form.price)!;
  return {
    p_product: product,
    p_variants: form.variants.map((v) => ({
      id: variantSlug(v.label),
      label: v.label.trim(),
      price: parsePrice(v.price)!,
      sort_order: parseSortOrder(v.sortOrder)!,
      is_active: v.isActive,
    })),
    p_position: info.automatic ? null : Number(form.position.trim()),
  };
}

export type CreateResult =
  | { ok: true; productId: string; name: string; imageUrl: string }
  | { ok: false; error: string; failedStep: "photo" | "create"; uploadedPath: string | null };

type UploadPhoto = (
  client: SupabaseClient,
  productId: string,
  file: File,
) => Promise<{ ok: true; path: string; publicUrl: string } | { ok: false; error: string }>;

/**
 * 1. ID généré, photo téléversée (aucune écriture en base) — échec → aucun produit.
 * 2. RPC admin_create_product — une transaction ; échec → aucun produit (le fichier téléversé
 *    reste dans Storage, son chemin est renvoyé ; il n'est référencé par rien).
 */
export async function createProduct(
  client: SupabaseClient,
  form: NewProductForm,
  rows: MenuRows,
  photo: File,
  uploadPhoto: UploadPhoto,
  productId: string = newProductId(),
): Promise<CreateResult> {
  const up = await uploadPhoto(client, productId, photo);
  if (!up.ok) return { ok: false, error: up.error, failedStep: "photo", uploadedPath: null };

  const payload = buildCreatePayload(form, rows, productId, up.publicUrl);
  const { data, error } = await client.rpc("admin_create_product", payload);
  if (error) {
    const message =
      error.code === "PGRST202" || /could not find the function/i.test(error.message)
        ? "La fonction de création n'est pas installée sur Supabase (migration admin_create_product)."
        : saveErrorMessage(error);
    return { ok: false, error: message, failedStep: "create", uploadedPath: up.path };
  }
  const created = data as { product: { id: string; name: string; image_url: string } };
  return { ok: true, productId: created.product.id, name: created.product.name, imageUrl: created.product.image_url };
}
