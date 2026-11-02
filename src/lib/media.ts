/**
 * Photos du menu hébergées avec le site (public/media/), copiées octet pour octet depuis l'ancien
 * stockage Supabase (scripts/build-static-menu.py). Chaque photo a des versions allégées
 * pré-générées : `<nom>-<largeur>.webp`, même fichier redimensionné, ratio conservé (« contain »),
 * jamais agrandi, WebP qualité 75 — les règles de l'ancienne transformation d'images Supabase.
 * Si une version manque, les composants reviennent au fichier d'origine (onError).
 */

export const MEDIA_PREFIX = "/media/";

/** URL de la version allégée à `width` px, ou null si l'image n'est pas une photo de /media/. */
export function mediaImageUrl(url: string | undefined, width: number): string | null {
  if (!url || !url.startsWith(MEDIA_PREFIX)) return null;
  const match = url.split("?")[0].match(/^(.*)\.(?:jpe?g|png|webp)$/i);
  if (!match) return null;
  return `${match[1]}-${width}.webp`;
}

/** srcSet « url 640w, … » pour les largeurs données, ou null hors /media/. */
export function mediaImageSrcSet(url: string | undefined, widths: readonly number[]): string | null {
  const parts: string[] = [];
  for (const w of widths) {
    const u = mediaImageUrl(url, w);
    if (!u) return null;
    parts.push(`${u} ${w}w`);
  }
  return parts.join(", ");
}
