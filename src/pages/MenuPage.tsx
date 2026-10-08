import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { CartAnnouncer } from "../cart/CartAnnouncer";
import { CartBar } from "../components/CartBar";
import { PhoneIcon } from "../components/Icons";
import { MenuFooter } from "../components/MenuFooter";
import { ReassuranceBand } from "../components/ReassuranceBand";
import { SITE } from "../config/site";
import type { MenuSnapshot } from "../data/menuSource";
import { menuCategoryDisplayMode } from "../data/menuRows";
import { groupItemsForMenuTab } from "../data/menuTabSections";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { DishRow } from "../menu/DishRow";
import { useMenu } from "../menu/MenuProvider";
import { categoryAnchorId, categoryDisplayTitle } from "../menu/menuDisplay";

/** Sections dans l'ordre client (catégories du menu), catégories vides ignorées. */
function toSections(menu: MenuSnapshot) {
  return menu.categories
    .map((category) => ({
      category,
      items: menu.items.filter((it) => it.category === category),
    }))
    .filter((s) => s.items.length > 0);
}

/** Menu digital (/menu) — point d'entrée QR code : un seul scroll, catégories sticky. */
export function MenuPage() {
  /** Menu lu via la couche d'accès (MenuProvider → source active). */
  const menu = useMenu();
  const SECTIONS = useMemo(() => toSections(menu), [menu]);
  const reducedMotion = usePrefersReducedMotion();
  const headerRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLUListElement>(null);
  /** Barre sous l'onglet actif : position et largeur du libellé actif. */
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null);
  const [active, setActive] = useState<string>(SECTIONS[0]?.category ?? "");
  /**
   * Catégorie cliquée : elle reste active pendant tout le défilement animé, et le scrollspy
   * ne reprend la main qu'à la fin réelle du scroll (ou dès que l'utilisateur fait défiler lui-même).
   */
  const clicked = useRef<{ category: string; locked: boolean; target: number; at: number } | null>(
    null,
  );
  const settleTimer = useRef<number | null>(null);
  const releaseRef = useRef<() => void>(() => {});

  /** Hauteur des barres fixes une fois la page défilée : header + sommaire. */
  const stickyOffset = useCallback(
    () => (headerRef.current?.offsetHeight ?? 0) + (stickyRef.current?.offsetHeight ?? 0) + 8,
    [],
  );

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (clicked.current?.locked) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      // Catégorie active : dernière section dont le haut a passé la barre sticky (tolérance 24 px).
      const limit = stickyOffset() + 24;
      let current: string = SECTIONS[0]?.category ?? "";
      for (const { category } of SECTIONS) {
        const el = document.getElementById(categoryAnchorId(category));
        if (el && el.getBoundingClientRect().top <= limit) current = category;
        else break;
      }
      // Bas de page : les dernières sections sont trop courtes pour atteindre la barre.
      if (window.scrollY >= max - 2) {
        current = clicked.current?.category ?? SECTIONS[SECTIONS.length - 1]?.category ?? current;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (clicked.current?.locked) {
        // Défilement animé en cours : on attend 150 ms sans mouvement pour conclure qu'il est fini.
        if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
        settleTimer.current = window.setTimeout(release, 150);
      }
      if (!frame) frame = requestAnimationFrame(update);
    };
    /**
     * Fin du défilement animé : uniquement quand la page a réellement atteint la cible
     * (Chrome émet parfois un scroll/scrollend sans mouvement juste après le clic).
     * Garde-fou : libération forcée après 2,5 s.
     */
    const release = () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
      const c = clicked.current;
      if (c?.locked) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const reached = Math.abs(window.scrollY - Math.min(c.target, max)) <= 2;
        if (!reached && performance.now() - c.at < 2500) {
          settleTimer.current = window.setTimeout(release, 150);
          return;
        }
        c.locked = false;
      }
      update();
    };
    releaseRef.current = release;
    /** L'utilisateur reprend la main : le clic précédent ne compte plus. */
    const onUserScroll = () => {
      if (!clicked.current) return;
      clicked.current = null;
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
      update();
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scrollend", release);
    window.addEventListener("resize", onScroll, { passive: true });
    window.addEventListener("wheel", onUserScroll, { passive: true });
    window.addEventListener("touchstart", onUserScroll, { passive: true });
    window.addEventListener("keydown", onUserScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", release);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("wheel", onUserScroll);
      window.removeEventListener("touchstart", onUserScroll);
      window.removeEventListener("keydown", onUserScroll);
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [stickyOffset, SECTIONS]);

  // Place la barre sous l'onglet actif (au changement d'onglet, au redimensionnement, au chargement des polices).
  useLayoutEffect(() => {
    const place = () => {
      const link = navRef.current?.querySelector<HTMLElement>(`[data-cat="${CSS.escape(active)}"]`);
      if (link) setIndicator({ x: link.offsetLeft, w: link.offsetWidth });
    };
    place();
    window.addEventListener("resize", place);
    document.fonts?.ready.then(place).catch(() => {});
    return () => window.removeEventListener("resize", place);
  }, [active]);

  // Garde la catégorie active visible dans la navigation horizontale (sans bouger la page).
  useEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector<HTMLElement>(`[data-cat="${CSS.escape(active)}"]`);
    if (!nav || !link) return;
    const left = link.offsetLeft - nav.clientWidth / 2 + link.offsetWidth / 2;
    nav.scrollTo({ left, behavior: reducedMotion ? "instant" : "smooth" });
  }, [active, reducedMotion]);

  const goTo = (category: string) => {
    const el = document.getElementById(categoryAnchorId(category));
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - stickyOffset();
    setActive(category);
    clicked.current = { category, locked: true, target: top, at: performance.now() };
    // Si la page est déjà à la bonne position, aucun scroll n'aura lieu : on vérifie quand même.
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => releaseRef.current(), 150);
    window.scrollTo({ top, behavior: reducedMotion ? "instant" : "smooth" });
  };

  const sections = useMemo(
    () =>
      SECTIONS.map((s) => ({
        ...s,
        groups: groupItemsForMenuTab(s.category, [...s.items], menuCategoryDisplayMode(menu, s.category)),
      })),
    [SECTIONS, menu],
  );

  return (
    <div className="min-h-dvh bg-[#f7f6f2]">
      <header ref={headerRef} className="sticky top-0 z-30 bg-[#0c1712]">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2.5 px-3 sm:gap-3 sm:px-6">
          <BrandLogo size={36} className="ring-1 ring-kaytori-gold/30" />
          <div className="min-w-0 flex-1 leading-none">
            {/* Titre principal de la page (seul H1 public) : rendu visuel identique à l'ancien <p>. */}
            <h1 className="truncate font-display text-[1.1rem] font-semibold tracking-tight text-kaytori-cream">
              {SITE.nameAccent} Sushi
            </h1>
            <p className="mt-1.5 whitespace-nowrap font-sans text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-kaytori-gold/85">
              Sushi · Wok · Thaï
            </p>
          </div>
          <a
            href={`tel:+${SITE.callE164}`}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-kaytori-gold/40 px-3.5 font-sans text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-kaytori-goldLight transition-colors hover:border-kaytori-gold/70 active:bg-white/10 sm:min-h-[40px] sm:px-4 sm:text-[0.72rem]"
            aria-label={`Appeler ${SITE.callDisplay}`}
          >
            <PhoneIcon className="h-4 w-4 shrink-0" />
            <span className="max-[359px]:sr-only">Appeler</span>
          </a>
        </div>
        <div
          className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-kaytori-gold/55 to-transparent"
          aria-hidden
        />
      </header>

      <ReassuranceBand />

      {/* Bannière photo (décorative) : courte, sans texte ni overlay. */}
      <div className="aspect-[2/1] max-h-[13.5rem] w-full overflow-hidden bg-[#0f1815] md:aspect-auto md:h-52 md:max-h-none lg:h-56">
        <img
          src="/banner/kaytori-makis-960.webp"
          srcSet="/banner/kaytori-makis-640.webp 640w, /banner/kaytori-makis-960.webp 960w, /banner/kaytori-makis-1280.webp 1280w"
          sizes="100vw"
          width={1280}
          height={852}
          alt=""
          fetchPriority="high"
          decoding="async"
          className="h-full w-full object-cover object-[50%_62%] md:object-[50%_40%]"
        />
      </div>

      <div ref={stickyRef} className="sticky top-14 z-20 shadow-[0_6px_16px_-10px_rgba(10,15,13,0.25)]">
        <nav className="border-b border-kaytori-black/[0.06] bg-[#fafaf7]" aria-label="Catégories du menu">
          <ul
            ref={navRef}
            className="relative mx-auto flex max-w-5xl list-none gap-5 overflow-x-auto overscroll-x-contain px-4 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-7 sm:px-6 [&::-webkit-scrollbar]:hidden"
          >
            {SECTIONS.map(({ category }) => {
              const isActive = category === active;
              return (
                <li key={category} className="shrink-0">
                  <a
                    href={`#${categoryAnchorId(category)}`}
                    data-cat={category}
                    onClick={(e) => {
                      e.preventDefault();
                      goTo(category);
                    }}
                    aria-current={isActive ? "true" : undefined}
                    className={`grid min-h-[48px] items-center whitespace-nowrap font-sans text-[0.925rem] text-kaytori-black ${
                      isActive ? "font-bold" : "font-normal"
                    }`}
                  >
                    {/* Réserve la largeur du gras : pas de décalage quand l'onglet devient actif. */}
                    <span aria-hidden className="invisible col-start-1 row-start-1 h-0 font-bold">
                      {category}
                    </span>
                    <span className="col-start-1 row-start-1 text-center">{category}</span>
                  </a>
                </li>
              );
            })}
            {indicator ? (
              <li
                aria-hidden
                className="pointer-events-none absolute bottom-0 left-0 h-[3px] rounded-full bg-kaytori-black transition-[transform,width] duration-200 ease-out motion-reduce:transition-none"
                style={{ transform: `translateX(${indicator.x}px)`, width: indicator.w }}
              />
            ) : null}
          </ul>
        </nav>
      </div>

      <main
        id="contenu-principal"
        className="mx-auto max-w-5xl px-3 pb-12 pt-4 sm:px-6"
      >
        {/* Mot d'accueil : bandeau vert sobre, filets or, texte crème (contenu HTML conservé pour le SEO). */}
        <div className="mx-auto mb-5 max-w-2xl rounded-lg bg-kaytori-greenDark px-5 py-3.5 text-center sm:px-10 sm:py-4">
          <span aria-hidden className="mx-auto block h-px w-10 bg-kaytori-gold/70" />
          <p className="mx-auto my-2.5 max-w-[34rem] text-balance font-display text-[0.9rem] leading-relaxed text-kaytori-cream/90 sm:text-[0.98rem]">
            Bienvenue chez <span className="text-kaytori-gold">{SITE.nameAccent} Sushi</span> à {SITE.city}.{" "}
            <span className="whitespace-nowrap">Laissez-vous</span> tenter par une expérience culinaire unique, où{" "}
            <em className="text-kaytori-goldLight">fraîcheur, créativité et raffinement</em> se rencontrent pour
            éveiller vos papilles.
          </p>
          <span aria-hidden className="mx-auto block h-px w-10 bg-kaytori-gold/70" />
        </div>
        <div className="space-y-8">
          {sections.map(({ category, items, groups }) => (
            <section
              key={category}
              id={categoryAnchorId(category)}
              aria-labelledby={`heading-${categoryAnchorId(category)}`}
            >
              <h2
                id={`heading-${categoryAnchorId(category)}`}
                className="mb-3 flex items-baseline gap-2 border-b-2 border-kaytori-gold/40 pb-2 font-display text-[1.25rem] font-bold leading-tight tracking-tight text-kaytori-black sm:text-[1.45rem]"
              >
                <span className="min-w-0">{categoryDisplayTitle(category)}</span>
                <span className="ml-auto shrink-0 whitespace-nowrap font-sans text-[0.68rem] font-medium uppercase tracking-[0.14em] text-kaytori-muted">
                  {items.length} plat{items.length !== 1 ? "s" : ""}
                </span>
              </h2>
              <ul className="grid list-none grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-3">
                {groups.map((g, gi) => (
                  <Fragment key={`${category}-${g.title || "all"}-${gi}`}>
                    {g.title ? (
                      <li className="col-span-full list-none">
                        <h3 className="mt-2 border-b border-kaytori-black/[0.08] pb-1.5 text-center font-display text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-kaytori-black/80">
                          {g.title}
                        </h3>
                      </li>
                    ) : null}
                    {g.items.map((item) => (
                      <DishRow key={item.id} item={item} />
                    ))}
                  </Fragment>
                ))}
              </ul>
            </section>
          ))}
        </div>

      </main>

      <MenuFooter />

      <CartBar />
      <CartAnnouncer />
    </div>
  );
}
