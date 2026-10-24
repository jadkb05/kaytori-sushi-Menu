/**
 * Photos de couverture du menu public (carrousel).
 * Lecture des lignes actives ordonnées ; repli sur la bannière statique historique.
 */
export type CoverSlide = {
  id: string;
  imageUrl: string;
  /** srcSet optionnel (bannière locale multi-résolutions). */
  srcSet?: string;
};

/** Bannière déjà servie par le site (fichiers public/banner/). */
export const FALLBACK_COVER_SLIDE: CoverSlide = {
  id: "cover-default",
  imageUrl: "/banner/kaytori-makis-960.webp",
  srcSet: "/banner/kaytori-makis-640.webp 640w, /banner/kaytori-makis-960.webp 960w, /banner/kaytori-makis-1280.webp 1280w",
};

export function activeCoverSlides(rows: readonly { id: string; image_url: string; is_active: boolean; sort_order: number }[]): CoverSlide[] {
  return [...rows]
    .filter((r) => r.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((r) => ({ id: r.id, imageUrl: r.image_url }));
}

/**
 * null = indisponible (pas de client / table absente) → le composant garde le repli statique.
 * Tableau (éventuellement vide) = lecture OK ; vide → repli aussi.
 */
export async function fetchPublishedCoverSlides(): Promise<CoverSlide[] | null> {
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) return null;
  const { getSupabaseClient } = await import("../lib/supabase/client");
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("cover_banners")
    .select("id, image_url, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order")
    .order("id");

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return null;
    return null;
  }
  return activeCoverSlides((data ?? []) as { id: string; image_url: string; is_active: boolean; sort_order: number }[]);
}
