/**
 * Couverture PC / tablette : bannière fixe (photo 3:1 affichée en 3,45:1, rognée au centre), indépendante des photos de couverture
 * de l'admin, qui ne pilotent que le carrousel mobile. Fichiers : public/banner/kaytori-pc-*.webp.
 */
export const DESKTOP_COVER_SRCSET =
  "/banner/kaytori-pc-1280.webp 1280w, /banner/kaytori-pc-1600.webp 1600w, /banner/kaytori-pc-2172.webp 2172w";

export function DesktopCoverBanner() {
  return (
    <div className="aspect-[69/20] max-h-[40rem] w-full overflow-hidden bg-[#0f1815]">
      <img
        src="/banner/kaytori-pc-1600.webp"
        srcSet={DESKTOP_COVER_SRCSET}
        sizes="100vw"
        width={2172}
        height={724}
        alt="Nouveau : nos formules midi et soir — Kaytôri Sushi"
        fetchPriority="high"
        decoding="async"
        draggable={false}
        className="h-full w-full select-none object-cover object-center"
      />
    </div>
  );
}
