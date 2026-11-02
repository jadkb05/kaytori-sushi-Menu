import { useEffect, useId, useRef, useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { SITE } from "../config/site";
import { HOME_SECTIONS, MENU_PATH } from "./homeContent";

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-home-lantern focus-visible:ring-offset-2 focus-visible:ring-offset-home-night";

/** Bouton principal « Commander » : mène toujours au menu digital existant. */
export function OrderLink({ className = "", children = "Commander" }: { className?: string; children?: string }) {
  return (
    <a
      href={MENU_PATH}
      className={`inline-flex min-h-[44px] items-center justify-center rounded-full bg-home-lantern px-6 font-sans text-[0.95rem] font-semibold text-home-night transition-colors hover:bg-home-lanternSoft ${focusRing} ${className}`}
    >
      {children}
    </a>
  );
}

/**
 * En-tête de la page d'accueil : transparent sur la photo, fond plein dès que la page défile.
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
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${
        filled ? "bg-home-night/95 shadow-[0_1px_0_rgba(227,177,90,0.18)] backdrop-blur" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-3 px-4 sm:px-8 md:h-[4.5rem] lg:px-12">
        <a href="/" className={`flex min-h-[44px] items-center gap-3 rounded-full pr-2 text-white ${focusRing}`}>
          <BrandLogo size={38} className="ring-1 ring-home-lantern/40" />
          <span className="whitespace-nowrap font-mincho text-[1.05rem] font-semibold leading-none max-[379px]:sr-only sm:text-[1.15rem]">{SITE.nameAccent} Sushi</span>
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

        <OrderLink className="ml-auto px-5 text-[0.9rem] lg:ml-4" />

        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? "Fermer la navigation" : "Ouvrir la navigation"}
          onClick={() => setOpen((v) => !v)}
          className={`-mr-1.5 inline-flex h-11 w-11 items-center justify-center rounded-full text-white lg:hidden ${focusRing}`}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            {open ? (
              <path d="M5 5l12 12M17 5L5 17" />
            ) : (
              <path d="M3 7h16M3 15h16" />
            )}
          </svg>
        </button>
      </div>

      <nav
        id={panelId}
        aria-label="Navigation principale"
        hidden={!open}
        className="border-t border-home-lantern/15 bg-home-night lg:hidden"
      >
        <ul className="mx-auto max-w-[90rem] px-4 pb-6 pt-2 sm:px-8">
          {[...HOME_SECTIONS.map((s) => ({ href: `#${s.id}`, label: s.label })), { href: MENU_PATH, label: "La carte" }].map(
            (link) => (
              <li key={link.href} className="border-b border-white/10 last:border-0">
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`flex min-h-[56px] items-center font-mincho text-[1.35rem] text-white ${focusRing}`}
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
