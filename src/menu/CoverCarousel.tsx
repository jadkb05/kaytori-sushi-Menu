import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { FALLBACK_COVER_SLIDE, fetchPublishedCoverSlides, type CoverSlide } from "../data/coverBanners";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

const AUTOPLAY_MS = 3000;
const RESUME_MS = 4500;
const SWIPE_THRESHOLD_PX = 48;

const FRAME =
  "aspect-[2/1] max-h-[13.5rem] w-full overflow-hidden bg-[#0f1815] md:aspect-auto md:h-52 md:max-h-none lg:h-64 xl:h-72";
const IMG =
  "pointer-events-none h-full w-full select-none object-cover object-[50%_62%] md:object-[50%_40%]";

function CoverImage({ slide, priority }: { slide: CoverSlide; priority: boolean }) {
  return (
    <img
      src={slide.imageUrl}
      srcSet={slide.srcSet}
      sizes="100vw"
      width={1280}
      height={640}
      alt=""
      draggable={false}
      fetchPriority={priority ? "high" : "auto"}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={IMG}
    />
  );
}

/**
 * Carrousel de couverture : auto 3 s vers la droite, boucle, pause pendant le glissement
 * (doigt / souris), reprise après interaction. Photos d'origine (object-cover, sans filtre).
 */
export function CoverCarousel() {
  const reducedMotion = usePrefersReducedMotion();
  const [slides, setSlides] = useState<CoverSlide[]>([FALLBACK_COVER_SLIDE]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dragPx, setDragPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPublishedCoverSlides().then((remote) => {
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
      setIndex((i) => (i + 1) % slides.length);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [slides.length, paused, reducedMotion, dragging]);

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
          <div key={slide.id} className="h-full shrink-0" style={{ width: `${slidePct}%` }} aria-hidden={i !== index}>
            <CoverImage slide={slide} priority={i === 0} />
          </div>
        ))}
      </div>

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
