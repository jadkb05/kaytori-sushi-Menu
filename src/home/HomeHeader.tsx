import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { SITE } from "../config/site";
import { BagIcon, Seigaiha } from "./HomeDecor";
import { HOME_SECTIONS, MENU_PATH } from "./homeContent";

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-home-lantern focus-visible:ring-offset-2 focus-visible:ring-offset-home-night";

/** Bouton principal « Commander » : mène toujours au menu digital existant. */
export function OrderLink({
  className = "",
  children = "Commander",
  icon,
}: {
  className?: string;
  children?: string;
  /** Icône à côté du libellé (sac dans le header, flèche dans les sections). */
  icon?: ReactNode;
}) {
  return (
    <a
      href={MENU_PATH}
      className={`group inline-flex min-h-[44px] items-center justify-center gap-2.5 rounded-full bg-home-lantern px-6 font-sans text-[0.95rem] font-semibold text-home-night shadow-[0_8px_24px_-10px_rgba(217,173,91,0.7)] transition-colors hover:bg-home-lanternSoft ${focusRing} ${className}`}
    >
      {icon}
      {children}
    </a>
  );
}

/**
 * En-tête de la page d'accueil : vert profond et filet doré ; une ombre apparaît dès que la page défile.
 * Téléphone : navigation dans un panneau ouvert par un bouton (Échap ou un lien le referme).
 */
export function HomeHeader() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const update = () => setSolid(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const filled = solid || open;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-shadow duration-300 ${
        filled ? "shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)]" : ""
      } isolate border-b border-home-lantern/35 bg-home-night`}
    >
      {/* Seigaiha très léger, en fondu vers le centre : présent sans gêner le logo ni le bouton. */}
      <Seigaiha className="right-0 top-0 -z-10 h-16 w-[55%] md:h-[4.5rem] [mask-image:linear-gradient(to_left,black,transparent)]" opacity={0.4} />
      <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-2 px-3.5 sm:px-8 md:h-[4.5rem] lg:px-12">
        <a href="/" className={`flex min-h-[44px] min-w-0 items-center gap-2.5 rounded-full pr-1 text-white sm:gap-3 ${focusRing}`}>
          <BrandLogo size={38} className="shrink-0 ring-1 ring-home-lantern ring-offset-2 ring-offset-home-night" />
          <span className="shrink-0 whitespace-nowrap font-display text-[1rem] font-medium leading-none max-[339px]:sr-only sm:text-[1.3rem]">{SITE.nameAccent} Sushi</span>
        </a>

        <nav aria-label="Navigation principale" className="ml-auto hidden lg:block">
          <ul className="flex items-center gap-1">
            {HOME_SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={`inline-flex min-h-[44px] items-center rounded-full px-4 font-sans text-[0.92rem] text-white/85 transition-colors hover:text-home-lanternSoft ${focusRing}`}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <OrderLink className="ml-auto shrink-0 gap-1.5 px-3.5 text-[0.86rem] max-sm:!min-h-[42px] max-sm:!px-[1.25rem] max-sm:!text-[0.92rem] max-[379px]:!px-[0.95rem] max-[379px]:!text-[0.86rem] sm:gap-2 sm:px-5 sm:text-[0.9rem] lg:ml-4" icon={<BagIcon className="-ml-0.5 max-[399px]:hidden" />} />

        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? "Fermer la navigation" : "Ouvrir la navigation"}
          onClick={() => setOpen((v) => !v)}
          className={`-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white lg:hidden ${focusRing}`}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            {open ? (
              <path d="M5 5l12 12M17 5L5 17" />
            ) : (
              <path d="M3 6h16M3 11h16M3 16h16" />
            )}
          </svg>
        </button>
      </div>

      <nav
        id={panelId}
        aria-label="Navigation principale"
        hidden={!open}
        className="border-t border-home-lantern/20 bg-home-night lg:hidden"
      >
        <ul className="mx-auto max-w-[90rem] px-4 pb-6 pt-2 sm:px-8">
          {[...HOME_SECTIONS.map((s) => ({ href: `#${s.id}`, label: s.label })), { href: MENU_PATH, label: "La carte" }].map(
            (link) => (
              <li key={link.href} className="border-b border-white/10 last:border-0">
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`flex min-h-[56px] items-center font-display text-[1.4rem] text-white transition-colors hover:text-home-lanternSoft ${focusRing}`}
                >
                  {link.label}
                </a>
              </li>
            ),
          )}
        </ul>
      </nav>
    </header>
  );
}
