import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "../cart/CartContext";
import { FORMULE_IMAGE_SIZE_BY_ID } from "../data/formulesPromos";
import type { YumloMenuItem } from "../data/yumloMenu";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { dishImage, formatPriceDH } from "./menuDisplay";
import { dishAnchorId } from "./menuSearch";
import { useDishAdd } from "./useDishAdd";

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
      <path
        d={direction === "left" ? "M12.5 4.5 7 10l5.5 5.5" : "M7.5 4.5 13 10l-5.5 5.5"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Carte d'une formule : affiche du client entière (`contain`, ratio d'origine, ni recadrage ni
 * zoom) dans un cadre doré aux proportions de l'affiche, sur un panneau vert laqué, et le bouton
 * d'ajout juste dessous.
 * Affiches de ratios différents : le bouton reste aligné en bas de carte dans la rangée.
 * Le nom, les pièces et le prix figurent sur l'affiche ; le prix du panier reste celui de la formule.
 * Dès 1024 px, le cadre mesure 17rem de large et la carte prend sa largeur.
 */
function FormuleCard({ item, highlighted }: { item: YumloMenuItem; highlighted: boolean }) {
  /** Même ajout au panier que les autres plats (aucune variante pour les formules). */
  const { handleAdd } = useDishAdd(item);
  const { lines } = useCart();
  const inCart = useMemo(
    () => lines.reduce((n, l) => (l.id === item.id ? n + l.quantity : n), 0),
    [lines, item.id],
  );
  const imageSize = FORMULE_IMAGE_SIZE_BY_ID[item.id];

  return (
    <li
      id={dishAnchorId(item.id)}
      className="relative w-[64%] shrink-0 touch-manipulation min-[400px]:w-[60%] min-[480px]:w-[46%] md:w-[calc((100%-1rem)/2)] lg:w-auto"
    >
      <article
        className={`flex h-full flex-col gap-2 rounded-[1.2rem] bg-[linear-gradient(160deg,#0a4632_0%,#003024_55%,#00241b_100%)] p-1.5 text-kaytori-cream shadow-[0_14px_22px_-16px_rgba(0,36,27,0.8)] ring-1 transition-shadow duration-500 motion-reduce:transition-none md:gap-2.5 md:rounded-[1.4rem] md:p-2.5 ${
          highlighted ? "ring-2 ring-kaytori-gold" : "ring-kaytori-gold/25"
        }`}
      >
        <div className="relative w-full shrink-0 rounded-xl bg-kaytori-gold/10 p-1 ring-1 md:rounded-2xl md:p-1.5 ring-kaytori-gold/45 lg:w-[17rem]">
          <img
            src={dishImage(item)}
            alt={`Affiche ${item.name} : ${item.description}, ${formatPriceDH(item.priceMAD)} DH`}
            width={imageSize?.width}
            height={imageSize?.height}
            loading="lazy"
            decoding="async"
            sizes="(min-width: 1024px) 260px, (min-width: 768px) 46vw, (min-width: 480px) 46vw, 62vw"
            className="block h-auto w-full rounded-lg object-contain object-center md:rounded-[10px]"
          />
          {inCart > 0 ? (
            <span
              key={inCart}
              className="absolute -right-1.5 -top-1.5 grid h-7 min-w-7 place-items-center rounded-full border-2 border-[#003024] bg-kaytori-gold px-1.5 font-sans text-[0.75rem] font-bold tabular-nums text-kaytori-black motion-safe:animate-badge-pop"
              aria-label={`${inCart} au panier`}
            >
              {inCart}
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleAdd}
          aria-label={`Ajouter ${item.name} au panier`}
          className="mt-auto inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-gold-shine px-3 font-sans text-[0.8rem] font-semibold md:min-h-[42px] md:gap-2 md:px-4 md:text-[0.9rem] text-kaytori-black shadow-[0_6px_18px_-8px_rgba(212,175,55,0.7)] transition-[filter] active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kaytori-goldLight focus-visible:ring-offset-2 focus-visible:ring-offset-[#003024]"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
          Ajouter au panier
        </button>
      </article>
    </li>
  );
}

/**
 * Rangée horizontale des formules : glissement au doigt libre (sans aimantation), flèches ← / →
 * (dès 768 px ; sur téléphone, glissement seul) qui avancent d'une carte et disparaissent en bout de rangée. Une formule et l'amorce de la
 * suivante sur téléphone (cartes compactes), deux dès 768 px. Dès 1024 px la fenêtre tient trois cartes entières :
 * une carte ≈ 18,25rem (cadre 17rem + padding md:p-2.5), donc une quatrième n'entrerait que par une
 * bande coupée. La fenêtre s'arrête après la troisième, anneau compris. Flèches à côté de la rangée dès 1280 px.
 */
export function FormulesCarousel({
  items,
  label,
  highlightId,
}: {
  items: readonly YumloMenuItem[];
  label: string;
  highlightId: string | null;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const update = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [update, items.length]);

  /** Avance ou recule d'une carte (largeur d'une carte + espacement). */
  const step = (dir: 1 | -1) => {
    const el = listRef.current;
    const card = el?.querySelector("li");
    if (!el || !card) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    el.scrollBy({ left: dir * (card.getBoundingClientRect().width + gap), behavior: reducedMotion ? "auto" : "smooth" });
  };

  const arrowClass =
    "absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-kaytori-gold/50 bg-[#003024]/90 text-kaytori-goldLight shadow-[0_6px_16px_-6px_rgba(0,36,27,0.7)] backdrop-blur-sm transition-opacity duration-200 active:bg-[#00241b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kaytori-gold disabled:pointer-events-none disabled:opacity-0 motion-reduce:transition-none md:grid";

  if (items.length === 0) {
    return (
      <p className="rounded-[1.2rem] border border-kaytori-gold/25 bg-[#003024] px-4 py-8 text-center font-sans text-sm text-kaytori-cream/85">
        Aucune formule disponible pour le moment.
      </p>
    );
  }

  return (
    <div className="relative" role="group" aria-roledescription="carrousel" aria-label={label}>
      <ul
        ref={listRef}
        className="-mb-8 -mt-2 flex w-full list-none gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-8 pt-2 md:gap-4 lg:w-[calc(3*(17rem+1.25rem)+2rem+0.25rem)] lg:max-w-full [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <FormuleCard key={item.id} item={item} highlighted={item.id === highlightId} />
        ))}
      </ul>
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={!canPrev}
        aria-label="Formules précédentes"
        className={`${arrowClass} left-1 xl:-left-14`}
      >
        <Chevron direction="left" />
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={!canNext}
        aria-label="Formules suivantes"
        className={`${arrowClass} right-1 xl:-right-14`}
      >
        <Chevron direction="right" />
      </button>
    </div>
  );
}
