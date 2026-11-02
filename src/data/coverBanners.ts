import { mediaImageSrcSet } from "../lib/media";
import menuData from "./menu.json";
import { formatDbPrice } from "./menuRows";
import type { ProductionMenuData } from "./productionMenu";

/**
 * Photos de couverture du menu public (carrousel).
 * Lignes actives ordonnées de src/data/menu.json ; repli sur la bannière statique historique.
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

/**
 * Couvertures actives, ordonnées (sort_order puis id), avec nom et prix de la formule liée
 * (produit actif dans une catégorie active, comme l'ancienne lecture publique) ; sinon décorative.
 */
export function buildCoverSlides(data: Pick<ProductionMenuData, "categories" | "products" | "cover_banners">): CoverSlide[] {
  const activeCategories = new Set(data.categories.filter((c) => c.is_active).map((c) => c.id));
  const products = new Map(
    data.products.filter((p) => p.is_active && activeCategories.has(p.category_id)).map((p) => [p.id, p]),
  );
  return activeCoverSlides(data.cover_banners).map((slide) => {
    if (!slide.productId) return slide;
    const p = products.get(slide.productId);
    if (!p) return { ...slide, productId: null };
    return { ...slide, productName: p.name, productPriceMAD: formatDbPrice(p.price) };
  });
}

const PRODUCTION_DATA = menuData as ProductionMenuData;

/** Couvertures publiques de la production (src/data/menu.json). */
export const PRODUCTION_COVER_SLIDES: readonly CoverSlide[] = buildCoverSlides(PRODUCTION_DATA);

/** Réglage « défilement automatique des couvertures » de la production (site_settings.cover_autoplay). */
export const PRODUCTION_COVER_AUTOPLAY: boolean = PRODUCTION_DATA.site_settings.cover_autoplay !== false;

/** Largeurs servies pour les couvertures (carrousel mobile pleine largeur) : 1280 px au plus. */
export const COVER_IMAGE_WIDTHS = [640, 960, 1280] as const;

/** srcSet de la couverture : bannière locale multi-résolutions, ou versions allégées de /media/. */
export function coverSlideSrcSet(slide: CoverSlide): string | undefined {
  return slide.srcSet ?? mediaImageSrcSet(slide.imageUrl, COVER_IMAGE_WIDTHS) ?? undefined;
}

/**
 * Télécharge la première couverture dès que la liste est connue, sans attendre le reste du menu
 * (même srcset / sizes que l'<img> du carrousel : le navigateur réutilise ce téléchargement).
 */
function preloadFirstCoverImage(slides: readonly CoverSlide[]): void {
  const first = slides[0];
  if (!first || typeof document === "undefined") return;
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = first.imageUrl;
  const srcSet = coverSlideSrcSet(first);
  if (srcSet) {
    link.setAttribute("imagesrcset", srcSet);
    link.setAttribute("imagesizes", "100vw");
  }
  link.setAttribute("fetchpriority", "high");
  // Mobile uniquement : sur PC / tablette, la couverture est la bannière fixe.
  link.media = "(max-width: 767px)";
  document.head.appendChild(link);
}

let firstCoverPreloaded = false;

/**
 * Couvertures (données statiques, disponibles immédiatement). Au premier appel (MenuProvider),
 * précharge la première photo, comme le faisait l'ancienne lecture distante.
 */
export function preloadPublishedCoverSlides(): Promise<CoverSlide[] | null> {
  if (!firstCoverPreloaded) {
    firstCoverPreloaded = true;
    preloadFirstCoverImage(PRODUCTION_COVER_SLIDES);
  }
  return Promise.resolve([...PRODUCTION_COVER_SLIDES]);
}

/** Couvertures publiques (jamais undefined : aucune lecture réseau en attente). */
export function preloadedCoverSlides(): CoverSlide[] | null | undefined {
  return [...PRODUCTION_COVER_SLIDES];
}

/** Réglage de défilement automatique (statique). */
export function preloadCoverAutoplay(): Promise<boolean> {
  return Promise.resolve(PRODUCTION_COVER_AUTOPLAY);
}

/** Réglage de défilement automatique, connu immédiatement. */
export function preloadedCoverAutoplay(): boolean | undefined {
  return PRODUCTION_COVER_AUTOPLAY;
}
