/**
 * Édition d'un produit existant : formulaire, validation, données envoyées à la RPC
 * admin_update_product (une transaction par appel) et vérification du résultat enregistré.
 *
 * Position : l'admin raisonne en positions humaines (1er, 2e, 3e…) dans la catégorie ; la
 * conversion vers sort_order (valeur globale interne) est faite par planCategoryReorder().
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryRow, MenuRows, ProductRow, VariantRow } from "../../data/menuRows";

export type VariantForm = {
  id: string;
  label: string;
  price: string;
  sortOrder: string;
  isActive: boolean;
};

export type ProductForm = {
  name: string;
  description: string;
  /** Ignoré pour un produit à variantes (prix gérés sur les variantes). */
  price: string;
  categoryId: string;
  isActive: boolean;
  /** Position humaine dans la catégorie : « 1 » = premier produit affiché. */
  position: string;
  variants: VariantForm[];
};

export type CategoryPosition = {
  /** 1 = premier produit de la catégorie. */
  position: number;
  total: number;
  /** Plats Thaï / Assortiments : le menu trie automatiquement, la position manuelle n'est pas utilisée. */
  automatic: boolean;
};

export type ProductEditData = {
  product: ProductRow;
  variants: VariantRow[];
  categories: CategoryRow[];
  hasVariants: boolean;
  /** Produits de la catégorie actuelle, dans l'ordre affiché (sert au calcul de position). */
  siblings: ProductRow[];
  position: CategoryPosition;
  form: ProductForm;
};

/** Ordre d'affichage d'une catégorie (même tri que le menu public : sort_order, puis id). */
const byDisplayOrder = (a: { sort_order: number; id: string }, b: { sort_order: number; id: string }) =>
  a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** « 69 », « 69.5 » → « 69.00 », « 69.50 » (saisie du formulaire, séparateur « . » ou « , »). */
function priceInput(v: number | string): string {
  return Number(v).toFixed(2);
}

/** Position réelle du produit dans sa catégorie. */
export function categoryPosition(rows: MenuRows, productId: string): CategoryPosition | null {
  const product = rows.products.find((p) => p.id === productId);
  if (!product) return null;
  const siblings = rows.products.filter((p) => p.category_id === product.category_id).sort(byDisplayOrder);
  const category = rows.categories.find((c) => c.id === product.category_id);
  return {
    position: siblings.findIndex((p) => p.id === productId) + 1,
    total: siblings.length,
    automatic: Boolean(category && category.display_mode !== "list"),
  };
}

/** Produit à éditer, depuis les lignes chargées de Supabase (null si l'ID n'existe pas). */
export function loadProductForEdit(rows: MenuRows, productId: string): ProductEditData | null {
  const product = rows.products.find((p) => p.id === productId);
  if (!product) return null;
  const variants = rows.variants
    .filter((v) => v.product_id === productId)
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const siblings = rows.products.filter((p) => p.category_id === product.category_id).sort(byDisplayOrder);
  const position = categoryPosition(rows, productId)!;
  return {
    product,
    variants,
    categories: [...rows.categories].sort((a, b) => a.sort_order - b.sort_order),
    hasVariants: variants.length > 0,
    siblings,
    position,
    form: {
      name: product.name,
      description: product.description ?? "",
      price: priceInput(product.price),
      categoryId: product.category_id,
      isActive: product.is_active,
      position: String(position.position),
      variants: variants.map((v) => ({
        id: v.id,
        label: v.label,
        price: priceInput(v.price),
        sortOrder: String(v.sort_order),
        isActive: v.is_active,
      })),
    },
  };
}

export type FormErrors = {
  name?: string;
  price?: string;
  categoryId?: string;
  position?: string;
  variants: Record<string, { label?: string; price?: string; sortOrder?: string }>;
};

/** Prix saisi → nombre (≥ 0, 2 décimales max) ou null si invalide. Accepte « 69,50 ». */
export function parsePrice(input: string): number | null {
  const s = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n < 100_000_000 ? n : null;
}

/** Ordre saisi (variantes) → entier ≥ 0 ou null si invalide. */
export function parseSortOrder(input: string): number | null {
  const s = input.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n <= 2_147_483_647 ? n : null;
}

/**
 * La position est-elle modifiable ? Non pour les catégories à ordre automatique, ni quand la
 * catégorie vient d'être changée dans le formulaire (la position se règle dans la catégorie
 * réelle, après enregistrement du changement de catégorie).
 */
export function isPositionEditable(data: Pick<ProductEditData, "position" | "product">, form: ProductForm): boolean {
  return !data.position.automatic && form.categoryId === data.product.category_id;
}

/** Position saisie → message d'erreur en français, ou null si valide (1 ≤ position ≤ total). */
export function positionError(input: string, total: number): string | null {
  const s = input.trim();
  if (s === "") return "Indiquez une position.";
  if (!/^-?\d+$/.test(s)) return "Position invalide : nombre entier (1, 2, 3…).";
  const n = Number(s);
  if (n < 1) return "La position minimum est 1.";
  if (n > total) return `La position maximum est ${total} (nombre de produits de la catégorie).`;
  return null;
}

export function hasErrors(errors: FormErrors): boolean {
  return Boolean(
    errors.name || errors.price || errors.categoryId || errors.position || Object.keys(errors.variants).length > 0,
  );
}

export function validateProductForm(
  form: ProductForm,
  data: Pick<ProductEditData, "hasVariants" | "categories" | "position" | "product">,
): FormErrors {
  const errors: FormErrors = { variants: {} };
  if (form.name.trim() === "") errors.name = "Le nom est obligatoire.";
  if (!data.hasVariants && parsePrice(form.price) === null) {
    errors.price = "Prix invalide : nombre positif, 2 décimales maximum (ex. 69 ou 69,50).";
  }
  if (!data.categories.some((c) => c.id === form.categoryId)) errors.categoryId = "Choisissez une catégorie existante.";
  if (isPositionEditable(data, form)) {
    const e = positionError(form.position, data.position.total);
    if (e) errors.position = e;
  }
  for (const v of form.variants) {
    const e: FormErrors["variants"][string] = {};
    if (v.label.trim() === "") e.label = "Le libellé est obligatoire.";
    if (parsePrice(v.price) === null) e.price = "Prix invalide.";
    if (parseSortOrder(v.sortOrder) === null) e.sortOrder = "Ordre invalide.";
    if (Object.keys(e).length > 0) errors.variants[v.id] = e;
  }
  return errors;
}

export type SortOrderChange = { id: string; sort_order: number };

/**
 * Position humaine → sort_order.
 *
 * Les sort_order d'une catégorie sont des valeurs globales internes (ex. Salades : 41…48),
 * pas des positions. Pour placer le produit en position N, on reprend l'ordre affiché de la
 * catégorie, on y déplace le produit, puis on redistribue LES MÊMES valeurs sort_order (triées)
 * dans ce nouvel ordre. Les valeurs de la catégorie restent celles d'avant (aucune collision
 * nouvelle), seuls les produits entre l'ancienne et la nouvelle position changent de valeur,
 * et revenir à la position initiale redonne exactement les valeurs d'origine.
 * Si les valeurs existantes ne sont pas strictement croissantes (doublons), on renumérote la
 * catégorie à partir de sa plus petite valeur (min, min+1, …) pour obtenir un ordre sans ambiguïté.
 */
export function planCategoryReorder(siblings: ProductRow[], productId: string, targetPosition: number): SortOrderChange[] {
  const ordered = [...siblings].sort(byDisplayOrder);
  const from = ordered.findIndex((p) => p.id === productId);
  if (from < 0) throw new Error(`Produit absent de la catégorie : ${productId}`);
  const to = Math.min(Math.max(targetPosition, 1), ordered.length) - 1;

  const values = ordered.map((p) => p.sort_order).sort((a, b) => a - b);
  const strictlyIncreasing = values.every((v, i) => i === 0 || v > values[i - 1]);
  const slots = strictlyIncreasing ? values : values.map((_, i) => values[0] + i);

  const reordered = [...ordered];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);

  return reordered
    .map((p, i) => ({ id: p.id, sort_order: slots[i], before: p.sort_order }))
    .filter((c) => c.sort_order !== c.before)
    .map(({ id, sort_order }) => ({ id, sort_order }));
}

export type UpdatePayload = {
  product: Partial<{
    name: string;
    description: string;
    price: number;
    category_id: string;
    is_active: boolean;
    sort_order: number;
  }>;
  variants: Array<{ id: string } & Partial<{ label: string; price: number; sort_order: number; is_active: boolean }>>;
};

export type EditPlan = {
  /** Modifications du produit édité (champs + son propre sort_order si la position change). */
  payload: UpdatePayload;
  /** sort_order des AUTRES produits de la catégorie à décaler (changement de position). */
  siblingSortOrders: SortOrderChange[];
};

/**
 * Champs modifiés uniquement (formulaire déjà validé). Le prix parent n'est jamais envoyé pour
 * un produit à variantes ; id, image_url et currency ne font jamais partie des données envoyées.
 */
export function buildEditPlan(data: ProductEditData, form: ProductForm): EditPlan {
  const p = data.product;
  const product: UpdatePayload["product"] = {};
  const name = form.name.trim();
  if (name !== p.name) product.name = name;
  if (form.description !== (p.description ?? "")) product.description = form.description;
  if (!data.hasVariants) {
    const price = parsePrice(form.price)!;
    if (price !== Number(p.price)) product.price = price;
  }
  if (form.categoryId !== p.category_id) product.category_id = form.categoryId;
  if (form.isActive !== p.is_active) product.is_active = form.isActive;

  let siblingSortOrders: SortOrderChange[] = [];
  if (isPositionEditable(data, form)) {
    const target = Number(form.position.trim());
    if (target !== data.position.position) {
      const changes = planCategoryReorder(data.siblings, p.id, target);
      const own = changes.find((c) => c.id === p.id);
      if (own) product.sort_order = own.sort_order;
      siblingSortOrders = changes.filter((c) => c.id !== p.id);
    }
  }

  const variants: UpdatePayload["variants"] = [];
  for (const v of form.variants) {
    const old = data.variants.find((x) => x.id === v.id);
    if (!old) continue;
    const change: UpdatePayload["variants"][number] = { id: v.id };
    const label = v.label.trim();
    if (label !== old.label) change.label = label;
    const price = parsePrice(v.price)!;
    if (price !== Number(old.price)) change.price = price;
    const sort = parseSortOrder(v.sortOrder)!;
    if (sort !== old.sort_order) change.sort_order = sort;
    if (v.isActive !== old.is_active) change.is_active = v.isActive;
    if (Object.keys(change).length > 1) variants.push(change);
  }
  return { payload: { product, variants }, siblingSortOrders };
}

/** Compatibilité Phase 3B : uniquement les modifications du produit édité. */
export function buildUpdatePayload(data: ProductEditData, form: ProductForm): UpdatePayload {
  return buildEditPlan(data, form).payload;
}

export function isEmptyPayload(payload: UpdatePayload): boolean {
  return Object.keys(payload.product).length === 0 && payload.variants.length === 0;
}

export type SavedProduct = {
  product: Omit<ProductRow, "price"> & { price: number | string };
  variants: Array<Omit<VariantRow, "price"> & { price: number | string }>;
};

/** Champs envoyés dont la valeur enregistrée diffère (vide = sauvegarde conforme). */
export function findUnappliedChanges(payload: UpdatePayload, saved: SavedProduct): string[] {
  const issues: string[] = [];
  const same = (a: unknown, b: unknown) =>
    typeof a === "number" || typeof b === "number" ? Number(a) === Number(b) : a === b;
  for (const [k, v] of Object.entries(payload.product)) {
    if (!same(saved.product[k as keyof SavedProduct["product"]], v)) issues.push(`produit.${k}`);
  }
  for (const change of payload.variants) {
    const row = saved.variants.find((x) => x.id === change.id);
    if (!row) {
      issues.push(`variante ${change.id}`);
      continue;
    }
    for (const [k, v] of Object.entries(change)) {
      if (!same(row[k as keyof typeof row], v)) issues.push(`variante ${change.id}.${k}`);
    }
  }
  return issues;
}

/** Message affiché à l'admin pour une erreur de sauvegarde. */
export function saveErrorMessage(error: { message: string; code?: string }): string {
  if (error.code === "42501" || /accès refusé|permission denied/i.test(error.message)) {
    return "Accès refusé : ce compte n'a pas les droits administrateur.";
  }
  if (/fetch|network/i.test(error.message)) return "Enregistrement impossible : vérifiez votre connexion Internet.";
  if (error.code === "PGRST202" || /could not find the function/i.test(error.message)) {
    return "La fonction d'enregistrement n'est pas installée sur Supabase (migration admin_update_product).";
  }
  return error.message;
}

/** Enregistre en UNE transaction (RPC). Renvoie les valeurs enregistrées ou un message d'erreur. */
export async function saveProduct(
  client: SupabaseClient,
  productId: string,
  payload: UpdatePayload,
): Promise<{ ok: true; saved: SavedProduct } | { ok: false; error: string }> {
  const { data, error } = await client.rpc("admin_update_product", {
    p_product_id: productId,
    p_product: payload.product,
    p_variants: payload.variants,
  });
  if (error) return { ok: false, error: saveErrorMessage(error) };
  return { ok: true, saved: data as SavedProduct };
}

/* ---------------------------------------------------------------------------
 * Photo et détection des modifications
 * ------------------------------------------------------------------------- */

/** Nouvelle photo choisie (pas encore téléversée) : fichier + aperçu local (object URL). */
export type PhotoSelection = { file: File; previewUrl: string };

/**
 * Le formulaire est modifié si UN SEUL élément change : un champ (nom, description, prix,
 * catégorie, statut, position), une variante, ou une nouvelle photo sélectionnée.
 */
export function isFormDirty(original: ProductForm, current: ProductForm, selectedPhoto: PhotoSelection | null): boolean {
  return selectedPhoto !== null || JSON.stringify(original) !== JSON.stringify(current);
}

export type SaveStep = "photo" | "fields" | "position" | "image_url";

export type SaveEditsResult =
  | { ok: true; productName: string; imageUrl: string | null }
  | { ok: false; error: string; failedStep: SaveStep; fieldsSaved: boolean; uploadedPath: string | null };

type PhotoDeps = {
  uploadPhoto: (
    client: SupabaseClient,
    productId: string,
    file: File,
  ) => Promise<{ ok: true; path: string; publicUrl: string } | { ok: false; error: string }>;
  saveImageUrl: (
    client: SupabaseClient,
    productId: string,
    url: string,
  ) => Promise<{ ok: true; imageUrl: string } | { ok: false; error: string }>;
};

/**
 * Enregistrement complet, dans cet ordre :
 *   1. photo : téléversement Storage (aucune écriture en base) — échec → rien n'est modifié ;
 *   2. produit édité : RPC admin_update_product (champs, variantes, son sort_order : 1 transaction) ;
 *   3. position : sort_order des autres produits décalés (1 RPC par produit, chacune atomique) ;
 *   4. photo : products.image_url uniquement.
 * L'ancienne photo n'est jamais supprimée. En cas d'échec à l'étape 3 ou 4, l'erreur indique
 * ce qui est déjà enregistré ; un nouvel enregistrement recalcule l'ordre depuis la base.
 */
export async function saveProductEdits(
  client: SupabaseClient,
  productId: string,
  plan: EditPlan,
  photo: File | null,
  deps: PhotoDeps,
): Promise<SaveEditsResult> {
  let uploaded: { path: string; publicUrl: string } | null = null;
  if (photo) {
    const up = await deps.uploadPhoto(client, productId, photo);
    if (!up.ok) return { ok: false, error: up.error, failedStep: "photo", fieldsSaved: false, uploadedPath: null };
    uploaded = up;
  }

  let productName = "";
  let fieldsSaved = false;
  if (!isEmptyPayload(plan.payload)) {
    const res = await saveProduct(client, productId, plan.payload);
    if (!res.ok) {
      return { ok: false, error: res.error, failedStep: "fields", fieldsSaved: false, uploadedPath: uploaded?.path ?? null };
    }
    const unapplied = findUnappliedChanges(plan.payload, res.saved);
    if (unapplied.length > 0) {
      return {
        ok: false,
        error: `Enregistrement non conforme (${unapplied.join(", ")}). Rechargez la page et vérifiez.`,
        failedStep: "fields",
        fieldsSaved: true,
        uploadedPath: uploaded?.path ?? null,
      };
    }
    fieldsSaved = true;
    productName = res.saved.product.name;
  }

  for (const change of plan.siblingSortOrders) {
    const res = await saveProduct(client, change.id, { product: { sort_order: change.sort_order }, variants: [] });
    if (!res.ok || Number(res.saved.product.sort_order) !== change.sort_order) {
      return {
        ok: false,
        error:
          "La nouvelle position n'a été que partiellement appliquée (aucun produit perdu ni modifié par ailleurs). " +
          `Enregistrez à nouveau pour terminer. Détail : ${res.ok ? "valeur non conforme" : res.error}`,
        failedStep: "position",
        fieldsSaved,
        uploadedPath: uploaded?.path ?? null,
      };
    }
  }

  let imageUrl: string | null = null;
  if (uploaded) {
    const res = await deps.saveImageUrl(client, productId, uploaded.publicUrl);
    if (!res.ok) {
      console.warn(`[admin] Photo téléversée mais non enregistrée pour ${productId} : ${uploaded.path}`);
      return {
        ok: false,
        error:
          (fieldsSaved ? "Les autres modifications sont enregistrées, mais la photo ne l'a pas été. " : "La photo n'a pas été enregistrée. ") +
          `${res.error} (fichier téléversé : ${uploaded.path})`,
        failedStep: "image_url",
        fieldsSaved,
        uploadedPath: uploaded.path,
      };
    }
    imageUrl = res.imageUrl;
  }

  return { ok: true, productName, imageUrl };
}
