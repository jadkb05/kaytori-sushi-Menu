/**
 * Photos de couverture du menu public (carrousel).
 * Lecture des lignes actives ordonnées ; repli sur la bannière statique historique.
 * Une couverture peut pointer vers une formule (product_id) pour le « + » panier.
 */
export type CoverSlide = {
  id: string;
  imageUrl: string;
  /** srcSet optionnel (bannière locale multi-résolutions). */
  srcSet?: string;
  /** Formule / produit à ajouter au panier (null = décoratif). */
  productId?: string | null;
  productName?: string | null;
  /** Prix MAD string catalogue, ex. « 89.00 ». */
  productPriceMAD?: string | null;
};

/** Bannière déjà servie par le site (fichiers public/banner/). */
export const FALLBACK_COVER_SLIDE: CoverSlide = {
  id: "cover-default",
  imageUrl: "/banner/kaytori-makis-960.webp",
  srcSet: "/banner/kaytori-makis-640.webp 640w, /banner/kaytori-makis-960.webp 960w, /banner/kaytori-makis-1280.webp 1280w",
};

/**
 * Associations relevées sur les affiches uploadées (nom + prix visibles sur la photo),
 * tant que la migration 11 (colonne product_id) n'est pas encore appliquée / pour filet de sécurité.
 */
export const COVER_PRODUCT_LINKS: Readonly<Record<string, string>> = {
  "cover-5bdc163cc0": "721f54c1ed", // Formule Californie — 89 DH
  "cover-4ed2ee762c": "4f85ff0b40", // Formule Aromaki — 99 DH
  "cover-74b47c2261": "539d5c9a19", // Formule Yakitori — 89 DH
  "cover-f83a14c3c4": "637a0e29de", // Formule Crunchy — 99 DH
  "cover-7688cc9cf4": "f0534d1ed8", // Formule Thaï — 99 DH
  "cover-6712afb710": "9d7cb6c1f9", // Formule Solo — 139 DH
  "cover-778984f58f": "formule-duo", // Formule Duo 1 — 279 DH
  "cover-71d6f65bac": "formule-duo", // Formule Duo 1 — 279 DH
  "cover-eb6a3cc1af": "f1f534eefe", // Formule Duo 2 — 239 DH
};

type CoverRow = {
  id: string;
  image_url: string;
  is_active: boolean;
  sort_order: number;
  product_id?: string | null;
};

export function resolveCoverProductId(row: { id: string; product_id?: string | null }): string | null {
  const fromDb = typeof row.product_id === "string" && row.product_id.trim() !== "" ? row.product_id.trim() : null;
  return fromDb ?? COVER_PRODUCT_LINKS[row.id] ?? null;
}

export function activeCoverSlides(rows: readonly CoverRow[]): CoverSlide[] {
  return [...rows]
    .filter((r) => r.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((r) => ({
      id: r.id,
      imageUrl: r.image_url,
      productId: resolveCoverProductId(r),
    }));
}

function priceToMadString(price: unknown): string {
  const n = typeof price === "number" ? price : Number.parseFloat(String(price ?? ""));
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
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

  let rows: CoverRow[] | null = null;
  const withProduct = await client
    .from("cover_banners")
    .select("id, image_url, sort_order, is_active, product_id")
    .eq("is_active", true)
    .order("sort_order")
    .order("id");
  if (withProduct.error && /product_id|column/i.test(withProduct.error.message)) {
    const fallback = await client
      .from("cover_banners")
      .select("id, image_url, sort_order, is_active")
      .eq("is_active", true)
      .order("sort_order")
      .order("id");
    if (fallback.error) {
      if (/does not exist|schema cache/i.test(fallback.error.message)) return null;
      return null;
    }
    rows = (fallback.data ?? []) as CoverRow[];
  } else if (withProduct.error) {
    if (/does not exist|schema cache/i.test(withProduct.error.message)) return null;
    return null;
  } else {
    rows = (withProduct.data ?? []) as CoverRow[];
  }

  const slides = activeCoverSlides(rows);
  const productIds = [...new Set(slides.map((s) => s.productId).filter((id): id is string => Boolean(id)))];
  if (productIds.length === 0) return slides;

  const products = await client
    .from("products")
    .select("id, name, price, is_active")
    .in("id", productIds)
    .eq("is_active", true);
  if (products.error || !products.data) return slides;

  const byId = new Map(
    products.data.map((p) => [
      String(p.id),
      { name: String(p.name), priceMAD: priceToMadString(p.price) },
    ]),
  );

  return slides.map((s) => {
    if (!s.productId) return s;
    const p = byId.get(s.productId);
    if (!p) return { ...s, productId: null };
    return { ...s, productName: p.name, productPriceMAD: p.priceMAD };
  });
}

let coverSlidesRequest: Promise<CoverSlide[] | null> | null = null;
let coverSlidesResult: CoverSlide[] | null | undefined;

/**
 * Lecture unique et partagée des couvertures : lancée par MenuProvider en même temps que le menu,
 * puis réutilisée par CoverCarousel (pas de seconde requête, pas de bannière de repli intermédiaire).
 */
export function preloadPublishedCoverSlides(): Promise<CoverSlide[] | null> {
  coverSlidesRequest ??= fetchPublishedCoverSlides()
    .catch(() => null)
    .then((slides) => {
      coverSlidesResult = slides;
      // Indisponible : un nouvel essai (bouton « Réessayer » du menu) relancera la lecture.
      if (slides === null) coverSlidesRequest = null;
      return slides;
    });
  return coverSlidesRequest;
}

/** Résultat déjà reçu de preloadPublishedCoverSlides() ; undefined tant que la lecture est en cours. */
export function preloadedCoverSlides(): CoverSlide[] | null | undefined {
  return coverSlidesResult;
}
