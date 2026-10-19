/**
 * Formules & Promos : produits de la catégorie formules-promos, via les RPC admin déjà en place.
 * L'affiche téléversée n'est pas recadrée ni recompressée.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { FORMULES_CATEGORY_ID } from "../../data/formulesPromos";
import type { MenuRows } from "../../data/menuRows";
import { createProduct, newProductId, type NewProductForm } from "./productCreate";
import { parsePrice, positionError, saveErrorMessage } from "./productEditor";
import type { PhotoOptimizer } from "./photoOptimize";
import { uploadProductPhoto, validatePhotoFile } from "./productPhoto";
import { deleteCatalogProduct, loadCatalogEdit, saveCatalogProduct, type CatalogForm } from "./productSave";

/** Conserve le fichier choisi, octet pour octet (pas de recadrage, pas de WebP, pas de filtre). */
export const keepFormulePoster: PhotoOptimizer = async (file) => ({
  ok: true,
  file,
  transformed: false,
  width: 0,
  height: 0,
  originalBytes: file.size,
  quality: null,
});

export function uploadFormulePoster(client: SupabaseClient, productId: string, file: File) {
  return uploadProductPhoto(client, productId, file, keepFormulePoster);
}

export type FormuleFormInput = {
  name: string;
  price: string;
  isActive: boolean;
  position: string;
};

export type FormuleFormErrors = {
  name?: string;
  price?: string;
  position?: string;
  photo?: string;
};

export function formuleCategoryReady(rows: MenuRows): boolean {
  return rows.categories.some((c) => c.id === FORMULES_CATEGORY_ID);
}

export function formuleCount(rows: MenuRows): number {
  return rows.products.filter((p) => p.category_id === FORMULES_CATEGORY_ID).length;
}

export function validateFormuleForm(
  form: FormuleFormInput,
  rows: MenuRows,
  photo: { type: string; size: number } | null,
  mode: "create" | "edit",
): FormuleFormErrors {
  const errors: FormuleFormErrors = {};
  if (!formuleCategoryReady(rows)) {
    errors.name = "La catégorie Formules & Promos n'est pas encore dans la base.";
  }
  if (form.name.trim() === "") errors.name = "Le nom est obligatoire.";
  const price = parsePrice(form.price);
  if (price === null || price <= 0) {
    errors.price = "Prix invalide : nombre positif, 2 décimales maximum (ex. 279 ou 279,50).";
  }
  const max = formuleCount(rows) + (mode === "create" ? 1 : 0);
  const position = positionError(form.position, Math.max(max, 1));
  if (position) errors.position = position;
  if (mode === "create") {
    if (!photo) errors.photo = "L'affiche est obligatoire.";
    else {
      const photoError = validatePhotoFile(photo);
      if (photoError) errors.photo = photoError;
    }
  } else if (photo) {
    const photoError = validatePhotoFile(photo);
    if (photoError) errors.photo = photoError;
  }
  return errors;
}

export function hasFormuleErrors(errors: FormuleFormErrors): boolean {
  return Boolean(errors.name || errors.price || errors.position || errors.photo);
}

function asNewProduct(form: FormuleFormInput): NewProductForm {
  return {
    name: form.name,
    description: "",
    categoryId: FORMULES_CATEGORY_ID,
    price: form.price,
    isActive: form.isActive,
    position: form.position,
    variants: [],
  };
}

export async function createFormule(
  client: SupabaseClient,
  rows: MenuRows,
  form: FormuleFormInput,
  photo: File,
) {
  return createProduct(client, asNewProduct(form), rows, photo, uploadFormulePoster, newProductId());
}

export async function saveFormule(
  client: SupabaseClient,
  rows: MenuRows,
  productId: string,
  form: FormuleFormInput,
  photo: File | null,
) {
  const data = loadCatalogEdit(rows, productId);
  if (!data || data.product.category_id !== FORMULES_CATEGORY_ID) {
    return { ok: false as const, error: "Cette formule est introuvable.", failedStep: "save" as const, uploadedPath: null };
  }
  const catalog: CatalogForm = {
    name: form.name,
    description: data.product.description ?? "",
    price: form.price,
    categoryId: FORMULES_CATEGORY_ID,
    isActive: form.isActive,
    position: form.position,
    variants: [],
  };
  return saveCatalogProduct(client, data, catalog, photo, uploadFormulePoster);
}

export async function setFormuleActive(client: SupabaseClient, productId: string, isActive: boolean) {
  const { error } = await client.rpc("admin_save_product", {
    p_product_id: productId,
    p_product: { is_active: isActive },
    p_variants: null,
    p_position: null,
  });
  if (!error) return { ok: true as const };
  return { ok: false as const, error: saveErrorMessage(error) };
}

export async function deleteFormule(client: SupabaseClient, productId: string) {
  return deleteCatalogProduct(client, productId);
}
