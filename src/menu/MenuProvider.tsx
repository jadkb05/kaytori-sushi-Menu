import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { SITE } from "../config/site";
import { preloadPublishedCoverSlides } from "../data/coverBanners";
import {
  fetchPublishedFormules,
  promoteFormulesCategory,
  replaceFormules,
} from "../data/formulesMenu";
import {
  ACTIVE_MENU_SOURCE,
  getInitialMenu,
  loadMenu,
  type MenuSnapshot,
  type MenuSource,
} from "../data/menuSource";

const MenuContext = createContext<MenuSnapshot | null>(null);

/**
 * Délai maximal du chargement distant au premier affichage. Au-delà, écran d'erreur
 * (jamais l'ancien menu statique) : plus large que MENU_LOAD_TIMEOUT_MS pour les réseaux mobiles lents.
 */
const REMOTE_MENU_TIMEOUT_MS = 10000;

/** Écran d'attente (source distante uniquement : la source statique s'affiche immédiatement). */
function MenuLoading() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#f7f6f2]"
      role="status"
      aria-live="polite"
    >
      <BrandLogo size={56} className="ring-1 ring-kaytori-gold/30 motion-safe:animate-pulse" />
      <p className="font-sans text-[0.8rem] font-medium text-kaytori-muted">Chargement du menu…</p>
    </div>
  );
}

/** Menu distant indisponible : message + nouvel essai, à la place de l'ancien menu statique. */
function MenuError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#f7f6f2] px-6 text-center"
      role="alert"
    >
      <BrandLogo size={56} className="ring-1 ring-kaytori-gold/30" />
      <div className="space-y-1">
        <p className="font-sans text-[0.9rem] font-semibold text-kaytori-black">Menu momentanément indisponible</p>
        <p className="font-sans text-[0.8rem] font-medium text-kaytori-muted">
          Vérifiez votre connexion puis réessayez, ou appelez-nous au{" "}
          <a href={`tel:+${SITE.callE164}`} className="whitespace-nowrap underline underline-offset-2">
            {SITE.callDisplay}
          </a>
          .
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full border border-kaytori-gold/40 bg-kaytori-black px-5 py-2.5 font-sans text-[0.8rem] font-semibold text-kaytori-gold transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kaytori-gold focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f6f2]"
      >
        Réessayer
      </button>
    </div>
  );
}

/** Résout `fallback` si `promise` échoue ou dépasse `ms` (lectures complémentaires du menu). */
function settleWithin<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/**
 * Fournit le menu à l'interface, quelle que soit la source :
 * - static : disponible immédiatement (rendu identique à la V1, sans écran d'attente),
 *   formules Supabase posées ensuite par-dessus ;
 * - supabase : menu, formules et couvertures lus en parallèle, affichés ensemble une fois prêts
 *   (aucun état intermédiaire). Échec ou délai dépassé → écran d'erreur, jamais le menu statique.
 * Overlay formules : si Supabase renvoie les sections, elles remplacent intégralement
 * l'affichage formules (jamais en complément du découpage heuristique).
 */
export function MenuProvider({
  children,
  source = ACTIVE_MENU_SOURCE,
}: {
  children: ReactNode;
  source?: MenuSource;
}) {
  const [menu, setMenu] = useState<MenuSnapshot | null>(() => {
    const initial = getInitialMenu(source);
    return initial ? promoteFormulesCategory(initial) : null;
  });
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const isRemote = getInitialMenu(source) === null;

  // Source distante : un seul affichage, avec les données Supabase complètes.
  useEffect(() => {
    if (!isRemote) return;
    let cancelled = false;
    void Promise.all([
      loadMenu(source, REMOTE_MENU_TIMEOUT_MS),
      settleWithin(fetchPublishedFormules(), REMOTE_MENU_TIMEOUT_MS, null),
      settleWithin(preloadPublishedCoverSlides(), REMOTE_MENU_TIMEOUT_MS, null),
    ]).then(([result, formules]) => {
      if (cancelled) return;
      if (result.fallbackReason !== null) {
        setFailed(true);
        return;
      }
      // null = formules indisponibles → découpage heuristique sur le menu Supabase.
      setMenu(
        formules === null
          ? promoteFormulesCategory(result.menu)
          : replaceFormules(result.menu, formules.items, formules.sections),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [isRemote, source, attempt]);

  // Source statique : formules Supabase posées sur le menu déjà affiché.
  useEffect(() => {
    if (isRemote) return;
    let cancelled = false;
    void fetchPublishedFormules().then((result) => {
      if (cancelled) return;
      setMenu((current) => {
        if (!current) return current;
        // null = indisponibilité réelle → garder le menu (statique / déjà promu).
        if (result === null) return promoteFormulesCategory(current);
        return replaceFormules(current, result.items, result.sections);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [isRemote]);

  if (failed) {
    return (
      <MenuError
        onRetry={() => {
          setFailed(false);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  if (!menu) return <MenuLoading />;
  return <MenuContext.Provider value={menu}>{children}</MenuContext.Provider>;
}

/** Menu chargé, ou null hors de MenuProvider (le panier retombe alors sur le statique). */
export function useOptionalMenu(): MenuSnapshot | null {
  return useContext(MenuContext);
}

/** Menu chargé (catégories + plats), au format de l'app V1. */
export function useMenu(): MenuSnapshot {
  const menu = useContext(MenuContext);
  if (!menu) throw new Error("useMenu doit être utilisé dans MenuProvider");
  return menu;
}
