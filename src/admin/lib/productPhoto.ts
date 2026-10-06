/**
 * Photo d'un produit (Phase 3C) : validation du fichier, chemin Storage, téléversement dans le
 * bucket public « menu-images » et mise à jour de products.image_url (rien d'autre).
 *
 * Droits : politiques existantes de storage.objects (écriture réservée à is_admin()) et
 * politique « products: admin » (update réservé à is_admin()). Aucune clé secrète.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const PHOTO_BUCKET = "menu-images";
/** Photos actuelles du menu : 53 à 259 Ko. 5 Mo laisse une marge large sans accepter n'importe quoi. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PHOTO_ACCEPT = PHOTO_MIME_TYPES.join(",");

const EXTENSIONS: Record<(typeof PHOTO_MIME_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Erreur en français si le fichier ne convient pas, sinon null. */
export function validatePhotoFile(file: { type: string; size: number }): string | null {
  if (!(PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "Format non accepté : choisissez une photo JPEG, PNG ou WebP.";
  }
  if (file.size === 0) return "Le fichier est vide.";
  if (file.size > PHOTO_MAX_BYTES) {
    return `Photo trop volumineuse (${(file.size / 1024 / 1024).toFixed(1)} Mo) : 5 Mo maximum.`;
  }
  return null;
}

/** Empreinte SHA-256 (hex) du contenu : même fichier → même nom, aucun doublon. */
export async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * products/{productId}/{empreinte}.{ext} — basé sur l'ID (jamais le nom du produit).
 * Le nom dépend du contenu : pas de collision, pas de doublon pour un même fichier, et une
 * nouvelle photo a une nouvelle URL (aucun cache navigateur/CDN sur l'ancienne).
 */
export function photoStoragePath(productId: string, hashHex: string, mimeType: string): string {
  const ext = EXTENSIONS[mimeType as keyof typeof EXTENSIONS];
  if (!ext) throw new Error(`Format non accepté : ${mimeType}`);
  return `products/${productId}/${hashHex.slice(0, 32)}.${ext}`;
}

export type PhotoUploadResult =
  | { ok: true; path: string; publicUrl: string }
  | { ok: false; error: string };

function storageErrorMessage(message: string): string {
  if (/row-level security|unauthorized|not authorized|permission|403/i.test(message)) {
    return "Accès refusé : ce compte ne peut pas téléverser de photo.";
  }
  if (/fetch|network/i.test(message)) return "Téléversement impossible : vérifiez votre connexion Internet.";
  if (/too large|payload|size/i.test(message)) return "Photo trop volumineuse pour le stockage.";
  return `Téléversement impossible : ${message}`;
}

/** Téléverse la photo (sans toucher à la base). Un fichier identique déjà présent est réutilisé. */
export async function uploadProductPhoto(client: SupabaseClient, productId: string, file: File): Promise<PhotoUploadResult> {
  const invalid = validatePhotoFile(file);
  if (invalid) return { ok: false, error: invalid };
  const path = photoStoragePath(productId, await sha256Hex(file), file.type);
  const bucket = client.storage.from(PHOTO_BUCKET);
  const { error } = await bucket.upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000", // nom basé sur le contenu : le fichier ne change jamais
    upsert: false,
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    return { ok: false, error: storageErrorMessage(error.message) };
  }
  return { ok: true, path, publicUrl: bucket.getPublicUrl(path).data.publicUrl };
}

/**
 * Met à jour UNIQUEMENT products.image_url de ce produit (id, devise, catégorie, variantes et
 * autres produits intacts). La RLS filtre silencieusement un non-admin : 0 ligne = refus.
 */
export async function saveProductImageUrl(
  client: SupabaseClient,
  productId: string,
  imageUrl: string,
): Promise<{ ok: true; imageUrl: string } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("products")
    .update({ image_url: imageUrl })
    .eq("id", productId)
    .select("id, image_url");
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as { id: string; image_url: string | null }[];
  if (rows.length !== 1) return { ok: false, error: "Accès refusé : ce compte n'a pas les droits administrateur." };
  if (rows[0].image_url !== imageUrl) return { ok: false, error: "La nouvelle adresse de la photo n'a pas été enregistrée." };
  return { ok: true, imageUrl: rows[0].image_url };
}
