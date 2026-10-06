/**
 * Client Supabase (navigateur / scripts locaux), basé uniquement sur la clé publique « anon ».
 * Ne jamais utiliser la clé service_role ici : elle donnerait un accès complet sans RLS.
 *
 * Client unique partagé par le menu public (VITE_MENU_SOURCE=supabase) et l'espace /admin.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseConfig = { url: string; anonKey: string };

/**
 * Lit VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ; null si non configuré.
 * (Lecture variable par variable : `import.meta.env` entier serait inliné dans le bundle.)
 */
export function readSupabaseConfig(
  env: Record<string, string | undefined> = {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  },
): SupabaseConfig | null {
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
    // Session conservée (localStorage) pour l'espace /admin ; sans effet sur le menu public,
    // qui ne retient que le contenu actif (rowsToMenu) quelle que soit la session.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}
