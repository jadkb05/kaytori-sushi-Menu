import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useCart } from "../cart/CartContext";
import {
  FALLBACK_COVER_SLIDE,
  coverSlideSrcSet,
  preloadPublishedCoverSlides,
  preloadedCoverSlides,
  type CoverSlide,
} from "../data/coverBanners";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

const AUTOPLAY_MS = 3000;
const RESUME_MS = 4500;
const SWIPE_THRESHOLD_PX = 48;

const FRAME =
  "aspect-[2/1] max-h-[13.5rem] w-full overflow-hidden bg-[#0f1815] md:aspect-auto md:h-52 md:max-h-none lg:aspect-[12/5] lg:h-auto lg:max-h-[78vh]";
const IMG =
  "pointer-events-none h-full w-full select-none object-cover object-[50%_62%] md:object-[50%_40%]";

function CoverImage({
  slide,
  priority,
  onSettled,
}: {
  slide: CoverSlide;
  priority: boolean;
  /** Image affichable (chargée) ou définitivement en échec : le défilement automatique peut y aller. */
  onSettled: (id: string) => void;
}) {
  /** Version allégée en erreur → fichier d'origine. */
  const [resizedFailed, setResizedFailed] = useState(false);
  const srcSet = resizedFailed ? undefined : coverSlideSrcSet(slide);
  return (
    <img
      src={slide.imageUrl}
      srcSet={srcSet}
      sizes="100vw"
      width={1280}
      height={640}
      alt=""
      draggable={false}
      fetchPriority={priority ? "high" : "auto"}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onLoad={() => onSettled(slide.id)}
      onError={() => (srcSet ? setResizedFailed(true) : onSettled(slide.id))}
      className={IMG}
    />
  );
}

/** Couvertures déjà reçues (préchargées avec le menu), sinon bannière de repli. */
function initialSlides(): CoverSlide[] {
  const remote = preloadedCoverSlides();
  return remote && remote.length > 0 ? remote : [FALLBACK_COVER_SLIDE];
}

/**
 * Carrousel de couverture : auto 3 s vers la droite, boucle, pause pendant le glissement
 * (doigt / souris), reprise après interaction. Photos d'origine (object-cover, sans filtre).
 * « + » or en bas à droite quand la photo est liée à une formule (nom + prix catalogue).
 */
export function CoverCarousel() {
  const { addItem, lines } = useCart();
  const reducedMotion = usePrefersReducedMotion();
  const [slides, setSlides] = useState<CoverSlide[]>(initialSlides);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dragPx, setDragPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settledRef = useRef(new Set<string>());
  const markSettled = useCallback((slideId: string) => {
    settledRef.current.add(slideId);
  }, []);

  useEffect(() => {
    if (preloadedCoverSlides() !== undefined) return;
    let cancelled = false;
    void preloadPublishedCoverSlides().then((remote) => {
      if (cancelled || remote === null) return;
      if (remote.length === 0) {
        setSlides([FALLBACK_COVER_SLIDE]);
        return;
      }
      setSlides(remote);
      setIndex(0);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pauseForInteraction = useCallback(() => {
    setPaused(true);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => setPaused(false), RESUME_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (slides.length <= 1 || paused || reducedMotion || dragging) return;
    const id = window.setInterval(() => {
      // Attendre que l'affiche suivante soit chargée : jamais de cadre vide en défilement automatique.
      setIndex((i) => {
        const next = (i + 1) % slides.length;
        return settledRef.current.has(slides[next].id) ? next : i;
      });
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [slides, paused, reducedMotion, dragging]);

  const goRelative = useCallback(
    (delta: number) => {
      if (slides.length <= 1) return;
      setIndex((i) => (i + delta + slides.length) % slides.length);
      pauseForInteraction();
    },
    [slides.length, pauseForInteraction],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (slides.length <= 1 || e.button !== 0) return;
    pointerIdRef.current = e.pointerId;
    startXRef.current = e.clientX;
    setDragging(true);
    setDragPx(0);
    pauseForInteraction();
    trackRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId || !dragging) return;
    setDragPx(e.clientX - startXRef.current);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    const dx = e.clientX - startXRef.current;
    pointerIdRef.current = null;
    setDragging(false);
    setDragPx(0);
    if (Math.abs(dx) >= SWIPE_THRESHOLD_PX) {
      goRelative(dx < 0 ? 1 : -1);
    } else {
      pauseForInteraction();
    }
  };

  const current = slides[index] ?? slides[0];
  const canAdd =
    Boolean(current?.productId && current.productName && current.productPriceMAD) && current !== undefined;
  const inCart =
    canAdd && current.productId
      ? lines.reduce((n, l) => (l.id === current.productId || l.id.startsWith(`${current.productId}:`) ? n + l.quantity : n), 0)
      : 0;

  const onAdd = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!canAdd || !current.productId || !current.productName || !current.productPriceMAD) return;
    addItem(current.productId, current.productName, current.productPriceMAD);
    pauseForInteraction();
  };

  const n = slides.length;
  // Piste = n × viewport ; chaque slide = 100/n % de la piste (= 100 % viewport).
  // translate % est relatif à la piste → -index × (100/n) % décale d'un viewport.
  const slidePct = 100 / Math.max(n, 1);
  const offsetPct = n <= 1 ? 0 : -index * slidePct;
  const trackWidth = trackRef.current?.clientWidth ?? 0;
  const dragPct = n <= 1 || trackWidth <= 0 ? 0 : (dragPx / trackWidth) * 100;

  return (
    <div
      className={`relative ${FRAME}`}
      role="region"
      aria-roledescription="carrousel"
      aria-label="Photos de couverture"
    >
      <div
        ref={trackRef}
        className="flex h-full touch-pan-y cursor-grab active:cursor-grabbing"
        style={{
          width: `${Math.max(n, 1) * 100}%`,
          transform: `translate3d(calc(${offsetPct}% + ${dragPct}%), 0, 0)`,
          transition: dragging || reducedMotion ? "none" : "transform 520ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {slides.map((slide, i) => (
          <div key={slide.id} className="relative h-full shrink-0" style={{ width: `${slidePct}%` }} aria-hidden={i !== index}>
            {/* Affiche visible et suivante en priorité : prêtes avant le défilement automatique. */}
            <CoverImage
              slide={slide}
              priority={i === 0 || i === index || i === (index + 1) % n}
              onSettled={markSettled}
            />
          </div>
        ))}
      </div>

      {canAdd ? (
        <button
          type="button"
          className="absolute bottom-0.5 right-0.5 z-20 grid h-[38px] w-[38px] place-items-center rounded-full border-2 border-kaytori-black bg-kaytori-gold/[0.88] text-[1.45rem] font-normal leading-none text-kaytori-black shadow-[0_6px_18px_-6px_rgba(0,0,0,0.7)] transition-[filter,transform] active:brightness-95 active:scale-95 md:h-10 md:w-10 md:text-[1.55rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kaytori-goldLight focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1815]"
          aria-label={`Ajouter ${current.productName} au panier`}
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onClick={onAdd}
        >
          <span aria-hidden>+</span>
          {inCart > 0 ? (
            <span
              key={inCart}
              className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-[#0f1815] bg-kaytori-black px-1 font-sans text-[0.65rem] font-bold tabular-nums text-kaytori-gold motion-safe:animate-badge-pop"
            >
              {inCart}
            </span>
          ) : null}
        </button>
      ) : null}

      {n > 1 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5" aria-hidden>
          {slides.map((s, i) => (
            <span
              key={s.id}
              className={`h-1 rounded-full transition-[width,background-color] duration-300 ${
                i === index ? "w-4 bg-kaytori-gold" : "w-1.5 bg-white/45"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
