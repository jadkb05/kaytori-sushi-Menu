/**
 * Réglages du menu public (table site_settings, ligne unique « default »).
 * Écriture via la RPC admin_update_site_settings (contrôle admin + journal d'audit).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveErrorMessage } from "./productEditor";

export type SiteSettings = {
  /** Défilement automatique des couvertures du menu public. */
  coverAutoplay: boolean;
};

export const SITE_SETTINGS_MIGRATION_HINT =
  "Le réglage du défilement automatique n'est pas encore installé sur Supabase (défilement actif par défaut). Appliquez supabase/production/12_site_settings.sql (avec autorisation).";

function isMissing(error: { message: string; code?: string }): boolean {
  return (
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    /could not find the (function|table)|does not exist|schema cache/i.test(error.message)
  );
}

/** null = table absente (migration 12 non appliquée) ; ligne absente → valeurs par défaut. */
export async function fetchSiteSettings(client: SupabaseClient): Promise<SiteSettings | null> {
  const { data, error } = await client.from("site_settings").select("cover_autoplay").eq("id", "default").maybeSingle();
  if (error) {
    if (isMissing(error)) return null;
    throw new Error(error.message);
  }
  return { coverAutoplay: data?.cover_autoplay !== false };
}

export async function updateCoverAutoplay(
  client: SupabaseClient,
  coverAutoplay: boolean,
): Promise<{ ok: true; settings: SiteSettings } | { ok: false; error: string }> {
  const { data, error } = await client.rpc("admin_update_site_settings", {
    p_changes: { cover_autoplay: coverAutoplay },
  });
  if (error) return { ok: false, error: isMissing(error) ? SITE_SETTINGS_MIGRATION_HINT : saveErrorMessage(error) };
  const row = (data ?? {}) as { cover_autoplay?: unknown };
  return { ok: true, settings: { coverAutoplay: row.cover_autoplay !== false } };
}
