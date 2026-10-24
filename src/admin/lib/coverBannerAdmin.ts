/**
 * Photos de couverture (Admin → Couverture) : CRUD via RPC dédiées,
 * fichiers dans le bucket public menu-images (chemins cover/…).
 * Aucune retouche : le fichier choisi est conservé octet pour octet.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { keepFormulePoster } from "./formuleAdmin";
import { saveErrorMessage } from "./productEditor";
import {
  PHOTO_ACCEPT,
  PHOTO_BUCKET,
  PHOTO_MIME_TYPES,
  PHOTO_MAX_BYTES,
  sha256Hex,
  validatePhotoFile,
  type PhotoUploadResult,
} from "./productPhoto";

export { PHOTO_ACCEPT, PHOTO_MAX_BYTES, validatePhotoFile };

export type CoverBannerRow = {
  id: string;
  image_url: string;
  storage_path: string | null;
  sort_order: number;
  is_active: boolean;
};

export const COVER_BANNERS_MIGRATION_HINT =
  "Les photos de couverture ne sont pas encore installées sur Supabase. Appliquez supabase/production/10_cover_banners.sql (avec autorisation).";

function rpcError(error: { message: string; code?: string }): string {
  if (error.code === "PGRST202" || /could not find the function|relation .* does not exist/i.test(error.message)) {
    return COVER_BANNERS_MIGRATION_HINT;
  }
  return saveErrorMessage(error);
}

function normalizeRow(row: Record<string, unknown>): CoverBannerRow {
  const path = row.storage_path;
  return {
    id: String(row.id),
    image_url: String(row.image_url),
    storage_path: typeof path === "string" && path.trim() !== "" ? path.trim() : null,
    sort_order: Number(row.sort_order),
    is_active: Boolean(row.is_active),
  };
}

/** null = table absente (migration 10 non appliquée). */
export async function fetchCoverBanners(client: SupabaseClient): Promise<CoverBannerRow[] | null> {
  const { data, error } = await client
    .from("cover_banners")
    .select("id, image_url, storage_path, sort_order, is_active")
    .order("sort_order")
    .order("id");
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => normalizeRow(row as Record<string, unknown>));
}

export function orderedCoverBanners(banners: readonly CoverBannerRow[]): CoverBannerRow[] {
  return [...banners].sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function coverBannerPosition(banners: readonly CoverBannerRow[], bannerId: string): number {
  return orderedCoverBanners(banners).findIndex((b) => b.id === bannerId) + 1;
}

export function newCoverBannerId(banners: readonly CoverBannerRow[]): string {
  const taken = new Set(banners.map((b) => b.id));
  for (let i = 0; i < 20; i++) {
    const id = `cover-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
    if (!taken.has(id)) return id;
  }
  return `cover-${Date.now().toString(36)}`;
}

/** cover/{bannerId}/{hash}.{ext} — même logique de déduplication que les produits. */
export function coverStoragePath(bannerId: string, hashHex: string, mimeType: string): string {
  const ext =
    mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : null;
  if (!ext) throw new Error(`Format non accepté : ${mimeType}`);
  if (!(PHOTO_MIME_TYPES as readonly string[]).includes(mimeType)) throw new Error(`Format non accepté : ${mimeType}`);
  return `cover/${bannerId}/${hashHex.slice(0, 32)}.${ext}`;
}

function storageErrorMessage(message: string): string {
  if (/row-level security|unauthorized|not authorized|permission|403/i.test(message)) {
    return "Accès refusé : ce compte ne peut pas téléverser de photo.";
  }
  if (/fetch|network/i.test(message)) return "Téléversement impossible : vérifiez votre connexion Internet.";
  if (/too large|payload|size/i.test(message)) return "Photo trop volumineuse pour le stockage.";
  return `Téléversement impossible : ${message}`;
}

/** Fichier d'origine → Storage (sans retouche). */
export async function uploadCoverPhoto(
  client: SupabaseClient,
  bannerId: string,
  original: File,
): Promise<PhotoUploadResult> {
  const invalid = validatePhotoFile(original);
  if (invalid) return { ok: false, error: invalid };
  const kept = await keepFormulePoster(original);
  if (!kept.ok) return { ok: false, error: kept.error };
  const file = kept.file;
  const path = coverStoragePath(bannerId, await sha256Hex(file), file.type);
  const bucket = client.storage.from(PHOTO_BUCKET);
  const { error } = await bucket.upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    return { ok: false, error: storageErrorMessage(error.message) };
  }
  return { ok: true, path, publicUrl: bucket.getPublicUrl(path).data.publicUrl };
}

export type CoverBannerActionResult = { ok: true; banner: CoverBannerRow } | { ok: false; error: string };

export async function createCoverBanner(
  client: SupabaseClient,
  banners: readonly CoverBannerRow[],
  input: { file: File; isActive: boolean; position: number | null },
): Promise<CoverBannerActionResult> {
  const id = newCoverBannerId(banners);
  const uploaded = await uploadCoverPhoto(client, id, input.file);
  if (!uploaded.ok) return uploaded;
  const { data, error } = await client.rpc("admin_create_cover_banner", {
    p_id: id,
    p_image_url: uploaded.publicUrl,
    p_storage_path: uploaded.path,
    p_is_active: input.isActive,
    p_position: input.position,
  });
  if (error) return { ok: false, error: rpcError(error) };
  return { ok: true, banner: normalizeRow(data as Record<string, unknown>) };
}

export async function updateCoverBanner(
  client: SupabaseClient,
  bannerId: string,
  changes: {
    isActive?: boolean;
    imageUrl?: string;
    storagePath?: string | null;
    position?: number;
  },
): Promise<CoverBannerActionResult> {
  const p_changes: Record<string, unknown> = {};
  if (changes.isActive !== undefined) p_changes.is_active = changes.isActive;
  if (changes.imageUrl !== undefined) p_changes.image_url = changes.imageUrl;
  if (changes.storagePath !== undefined) p_changes.storage_path = changes.storagePath;
  const { data, error } = await client.rpc("admin_update_cover_banner", {
    p_banner_id: bannerId,
    p_changes,
    p_position: changes.position ?? null,
  });
  if (error) return { ok: false, error: rpcError(error) };
  return { ok: true, banner: normalizeRow(data as Record<string, unknown>) };
}

export async function replaceCoverBannerPhoto(
  client: SupabaseClient,
  bannerId: string,
  file: File,
): Promise<CoverBannerActionResult> {
  const uploaded = await uploadCoverPhoto(client, bannerId, file);
  if (!uploaded.ok) return uploaded;
  return updateCoverBanner(client, bannerId, {
    imageUrl: uploaded.publicUrl,
    storagePath: uploaded.path,
  });
}

export async function deleteCoverBanner(
  client: SupabaseClient,
  bannerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client.rpc("admin_delete_cover_banner", { p_banner_id: bannerId });
  if (error) return { ok: false, error: rpcError(error) };
  return { ok: true };
}

export function coverMoveTarget(position: number, total: number, direction: "up" | "down"): number | null {
  const target = direction === "up" ? position - 1 : position + 1;
  return target >= 1 && target <= total ? target : null;
}

/**
 * Réordonne la liste (indices 0…N-1) et réécrit sort_order de façon contiguë.
 * Aucun effet si from/to hors bornes ou identiques.
 */
export function reorderCoverBanners(
  banners: readonly CoverBannerRow[],
  fromIndex: number,
  toIndex: number,
): CoverBannerRow[] {
  const ordered = orderedCoverBanners(banners);
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= ordered.length ||
    toIndex >= ordered.length ||
    fromIndex === toIndex
  ) {
    return ordered;
  }
  const next = [...ordered];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next.map((b, i) => ({ ...b, sort_order: i }));
}

/** Persiste la position humaine 1…N d'une photo après un glisser-déposer. */
export async function persistCoverBannerPosition(
  client: SupabaseClient,
  bannerId: string,
  position: number,
): Promise<CoverBannerActionResult> {
  return updateCoverBanner(client, bannerId, { position });
}
