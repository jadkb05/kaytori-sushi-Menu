import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { CartAnnouncer } from "../cart/CartAnnouncer";
import { CartBar } from "../components/CartBar";
import { PhoneIcon } from "../components/Icons";
import { MenuFooter } from "../components/MenuFooter";
import { MenuSearch } from "../components/MenuSearch";
import { ReassuranceBand } from "../components/ReassuranceBand";
import { SITE } from "../config/site";
import { FORMULE_MIDI_SCHEDULE_HINT, isFormuleMidiOffer } from "../data/formuleMidiAvailability";
import { isFormuleCarouselCategory } from "../data/formulesPromos";
import type { MenuSnapshot } from "../data/menuSource";
import { menuCategoryDisplayMode } from "../data/menuRows";
import { groupItemsForMenuTab } from "../data/menuTabSections";
import { useIsDesktopCover } from "../hooks/useIsDesktopCover";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { CoverCarousel } from "../menu/CoverCarousel";
import { DesktopCoverBanner } from "../menu/DesktopCoverBanner";
import { DishRow } from "../menu/DishRow";
import { FormulesCarousel } from "../menu/FormulesCarousel";
import { useMenu } from "../menu/MenuProvider";
import { categoryAnchorId, categoryDisplayTitle, formuleSectionSubtitle } from "../menu/menuDisplay";
import { resolveMenuDeepLink } from "../menu/menuDeepLinks";
import { dishAnchorId, type SearchMatch } from "../menu/menuSearch";

/** Durée de la mise en évidence d'un plat trouvé par la recherche (ms). */
const HIGHLIGHT_MS = 2400;

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
  const isDesktopCover = useIsDesktopCover();
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
  /** Plat mis en évidence après une recherche. */
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<number | null>(null);

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

  /**
   * Défile jusqu'à `el` sous les barres fixes ; `category` reste l'onglet actif pendant le défilement.
   * `instant` : arrivée directe (lien partagé ouvert), sans animation.
   */
  const scrollToElement = (el: HTMLElement, category: string, instant = false) => {
    const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - stickyOffset());
    setActive(category);
    clicked.current = { category, locked: true, target: top, at: performance.now() };
    // Si la page est déjà à la bonne position, aucun scroll n'aura lieu : on vérifie quand même.
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => releaseRef.current(), 150);
    window.scrollTo({ top, behavior: instant || reducedMotion ? "instant" : "smooth" });
  };

  const goTo = (category: string) => {
    const el = document.getElementById(categoryAnchorId(category));
    if (el) scrollToElement(el, category);
  };

  /** Plat trouvé par la recherche : défilement jusqu'à sa carte, puis brève mise en évidence. */
  const goToDish = (id: string) => {
    const el = document.getElementById(dishAnchorId(id));
    const item = menu.items.find((it) => it.id === id);
    if (!el || !item) return;
    scrollToElement(el, item.category);
    setHighlightId(id);
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
  };
  useEffect(() => () => {
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
  }, []);

  /**
   * Lien direct (#formules-solo-duo-family, #formules-midi, #promos) : arrivée sur la section.
   * À l'ouverture (menu déjà chargé : MenuProvider n'affiche
   * la page qu'avec les données), après les polices (hauteurs définitives), et à chaque changement de hash.
   * Sans hash reconnu : aucun effet, navigation inchangée.
   */
  const deepLinkMenu = useRef(menu);
  deepLinkMenu.current = menu;
  const openDeepLinkRef = useRef<() => void>(() => {});
  openDeepLinkRef.current = () => {
    const category = resolveMenuDeepLink(window.location.hash, deepLinkMenu.current);
    if (!category) return;
    const el = document.getElementById(categoryAnchorId(category));
    if (el) scrollToElement(el, category, true);
  };
  useEffect(() => {
    if (!resolveMenuDeepLink(window.location.hash, deepLinkMenu.current)) return;
    // La page gère elle-même la position : pas de restauration de l'ancien scroll au rechargement.
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    let cancelled = false;
    const frame = requestAnimationFrame(() => openDeepLinkRef.current());
    document.fonts?.ready
      .then(() => {
        // Recalage si les polices ont changé les hauteurs, sauf si le client a déjà fait défiler.
        if (!cancelled && clicked.current !== null) requestAnimationFrame(() => openDeepLinkRef.current());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    const onHashChange = () => openDeepLinkRef.current();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  /** Choix d'une suggestion : section (catégorie) ou plat ; navigation après la fermeture du panneau. */
  const onSearchSelect = (match: SearchMatch) => {
    requestAnimationFrame(() => {
      if (match.kind === "category") goTo(match.category);
      else goToDish(match.item.id);
    });
  };
  const headerHeight = useCallback(() => headerRef.current?.offsetHeight ?? 56, []);

  const sections = useMemo(
    () =>
      SECTIONS.map((s) => ({
        ...s,
        groups: groupItemsForMenuTab(s.category, [...s.items], menuCategoryDisplayMode(menu, s.category)),
      })),
    [SECTIONS, menu],
  );

  return (
    <div className="min-h-dvh bg-kaytori-page">
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
          <MenuSearch menu={menu} headerHeight={headerHeight} onSelect={onSearchSelect} />
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

      {/* Couverture : bannière fixe sur PC / tablette ; carrousel (photos de l'admin) sur mobile. */}
      {isDesktopCover ? <DesktopCoverBanner /> : <CoverCarousel />}

      <div ref={stickyRef} className="sticky top-14 z-20 shadow-[0_6px_16px_-10px_rgba(10,15,13,0.25)]">
        <nav className="border-b border-kaytori-black/[0.06] bg-[#fbf8f1]" aria-label="Catégories du menu">
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
        <div className="space-y-8">
          {sections.map(({ category, items, groups }) => {
            const sectionSubtitle = formuleSectionSubtitle(menu.formuleSectionDescriptions, category);
            return (
            <section
              key={category}
              id={categoryAnchorId(category)}
              aria-labelledby={`heading-${categoryAnchorId(category)}`}
            >
              <h2
                id={`heading-${categoryAnchorId(category)}`}
                className="mb-3 border-b-2 border-kaytori-gold/40 pb-2 font-display text-[1.25rem] font-bold leading-tight tracking-tight text-kaytori-black sm:text-[1.45rem]"
              >
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0">{categoryDisplayTitle(category)}</span>
                  <span className="ml-auto shrink-0 whitespace-nowrap font-sans text-[0.68rem] font-medium uppercase tracking-[0.14em] text-kaytori-muted">
                    {items.length} plat{items.length !== 1 ? "s" : ""}
                  </span>
                </span>
                {sectionSubtitle ? (
                  <span className="mt-1 block font-sans text-[0.68rem] font-medium normal-case tracking-[0.04em] text-kaytori-muted">
                    {sectionSubtitle}
                  </span>
                ) : null}
              </h2>
              {items.length > 0 && items.every(isFormuleMidiOffer) ? (
                <p className="-mt-1.5 mb-3 flex items-center gap-1.5 font-sans text-[0.72rem] font-medium text-kaytori-green sm:text-[0.78rem]">
                  <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-kaytori-gold" aria-hidden />
                  {FORMULE_MIDI_SCHEDULE_HINT}
                </p>
              ) : null}
              {/* Formules (3 sections) : mêmes grandes cartes en rangée ; le reste en grille. */}
              {isFormuleCarouselCategory(category, menu.formuleSectionNames) ? (
                <FormulesCarousel items={items} label={category} highlightId={highlightId} />
              ) : (
                <ul className="grid list-none grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
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
                        <DishRow key={item.id} item={item} highlighted={item.id === highlightId} />
                      ))}
                    </Fragment>
                  ))}
                </ul>
              )}
            </section>
            );
          })}
        </div>

      </main>

      <MenuFooter />

      <CartBar />
      <CartAnnouncer />
    </div>
  );
}
