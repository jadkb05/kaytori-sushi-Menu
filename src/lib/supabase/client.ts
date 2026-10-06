/**
 * Client Supabase (navigateur / scripts locaux), basé uniquement sur la clé publique « anon ».
 * Ne jamais utiliser la clé service_role ici : elle donnerait un accès complet sans RLS.
 *
 * Phase 1 : préparé mais pas utilisé par le menu public (source active : statique).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseConfig = { url: string; anonKey: string };

/** Lit VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ; null si non configuré. */
export function readSupabaseConfig(env: Record<string, string | undefined> = import.meta.env): SupabaseConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

let client: SupabaseClient | null = null;

/** Client partagé, créé au premier appel ; null si Supabase n'est pas configuré. */
export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client;
  const config = readSupabaseConfig();
  if (!config) return null;
  client = createClient(config.url, config.anonKey, {
    auth: { persistSession: false },
  });
  return client;
}
