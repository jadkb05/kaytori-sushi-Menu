import { createContext, useContext, useEffect, type ReactNode } from "react";
import { preloadPublishedCoverSlides } from "../data/coverBanners";
import { getMenu, type MenuSnapshot } from "../data/menuSource";

const MenuContext = createContext<MenuSnapshot | null>(null);

/**
 * Fournit le menu à l'interface : données de production statiques (src/data/menu.json),
 * disponibles dès le premier rendu — ni écran d'attente, ni écran d'erreur, ni requête réseau.
 * Les couvertures (même source) sont préchargées au montage : première photo en priorité.
 */
export function MenuProvider({
  children,
  menu = getMenu(),
}: {
  children: ReactNode;
  /** Menu à afficher (tests) ; par défaut, le menu de production. */
  menu?: MenuSnapshot;
}) {
  useEffect(() => {
    void preloadPublishedCoverSlides();
  }, []);
  return <MenuContext.Provider value={menu}>{children}</MenuContext.Provider>;
}

/** Menu chargé, ou null hors de MenuProvider (le panier retombe alors sur le menu de référence). */
export function useOptionalMenu(): MenuSnapshot | null {
  return useContext(MenuContext);
}

/** Menu chargé (catégories + plats), au format de l'app V1. */
export function useMenu(): MenuSnapshot {
  const menu = useContext(MenuContext);
  if (!menu) throw new Error("useMenu doit être utilisé dans MenuProvider");
  return menu;
}
