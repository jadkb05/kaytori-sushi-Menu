import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { BrandLogo } from "../components/BrandLogo";
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

/**
 * Fournit le menu à l'interface, quelle que soit la source :
 * - static : disponible immédiatement (rendu identique à la V1, sans écran d'attente) ;
 * - supabase : chargé une fois au démarrage, avec repli statique géré par loadMenu().
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

  useEffect(() => {
    if (menu) return;
    let cancelled = false;
    void loadMenu(source).then((result) => {
      if (!cancelled) setMenu(promoteFormulesCategory(result.menu));
    });
    return () => {
      cancelled = true;
    };
  }, [menu, source]);

  const waitingForMenu = menu === null;
  useEffect(() => {
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
  }, [waitingForMenu]);

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
