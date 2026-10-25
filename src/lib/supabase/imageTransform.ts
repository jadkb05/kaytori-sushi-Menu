/**
 * Versions allégées des photos Supabase Storage (bucket public), via la transformation d'images
 * Supabase : même fichier, redimensionné, ratio conservé (`resize=contain`), servi en WebP/AVIF
 * aux navigateurs qui l'acceptent, mis en cache CDN. Les fichiers d'origine ne sont pas modifiés :
 * en cas d'erreur de transformation, les composants reviennent à l'URL d'origine.
 */

const PUBLIC_OBJECT_PATH = "/storage/v1/object/public/";
const RENDER_PATH = "/storage/v1/render/image/public/";

function supabaseOrigin(): string | null {
  const raw = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/** URL redimensionnée à `width` px de large, ou null si l'image n'est pas une photo Supabase publique. */
export function supabaseImageUrl(url: string | undefined, width: number, quality = 75): string | null {
  const origin = supabaseOrigin();
  if (!url || !origin || !url.startsWith(`${origin}${PUBLIC_OBJECT_PATH}`)) return null;
  if (/\.(svg|gif)(\?|$)/i.test(url)) return null;
  const path = url.slice(origin.length + PUBLIC_OBJECT_PATH.length).split("?")[0];
  return `${origin}${RENDER_PATH}${path}?width=${width}&resize=contain&quality=${quality}`;
}

/** srcSet « url 640w, … » pour les largeurs données, ou null hors Supabase. */
export function supabaseImageSrcSet(url: string | undefined, widths: readonly number[]): string | null {
  const parts: string[] = [];
  for (const w of widths) {
    const u = supabaseImageUrl(url, w);
    if (!u) return null;
    parts.push(`${u} ${w}w`);
  }
  return parts.join(", ");
}
