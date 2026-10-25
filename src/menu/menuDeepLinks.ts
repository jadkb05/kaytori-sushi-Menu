/**
 * Liens directs vers les trois sections formules du menu :
 * #formules-solo-duo-family, #formules-midi, #promos — résolus sur le menu chargé.
 * Résolution par identifiants de section (sinon par libellé) : survit aux renommages admin
 * des sections. Les ancres de section existantes (#menu-cat-…) sont aussi acceptées.
 */
import { isFormuleMidiOffer } from "../data/formuleMidiAvailability";
import { isFormuleCarouselCategory } from "../data/formulesPromos";
import type { MenuSnapshot } from "../data/menuSource";
import type { YumloMenuItem } from "../data/yumloMenu";
import { categoryAnchorId } from "./menuDisplay";

export const MENU_DEEP_LINKS = ["formules-solo-duo-family", "formules-midi", "promos"] as const;

export type MenuDeepLink = (typeof MENU_DEEP_LINKS)[number];

const SOLO_DUO_FAMILY_SECTION_ID = "formules-solo-duo-family";
const PROMO_SECTION_ID = "promo";

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Section formules (carrousel) dont les offres vérifient `test`. */
function formuleSection(
  menu: MenuSnapshot,
  test: (items: YumloMenuItem[], category: string) => boolean,
): string | undefined {
  return menu.categories.find((category) => {
    if (!isFormuleCarouselCategory(category, menu.formuleSectionNames)) return false;
    const items = menu.items.filter((it) => it.category === category);
    return items.length > 0 && test(items, category);
  });
}

/** Identifiant lu dans un hash d'URL (« #Formules-Midi » → « formules-midi »), sans le #. */
export function menuDeepLinkFromHash(hash: string): string {
  try {
    return decodeURIComponent(hash.replace(/^#/, "")).trim().toLowerCase();
  } catch {
    return "";
  }
}

/** Section visée par un hash sur le menu chargé, ou null (hash absent, inconnu, ou section introuvable). */
export function resolveMenuDeepLink(hash: string, menu: MenuSnapshot): string | null {
  const key = menuDeepLinkFromHash(hash);
  if (!key) return null;
  const bySectionId = (sectionId: string, label: RegExp) =>
    formuleSection(
      menu,
      (items, name) => items.every((it) => it.formuleSectionId === sectionId) || label.test(normalize(name)),
    ) ?? null;

  switch (key) {
    case "formules-solo-duo-family":
      return bySectionId(SOLO_DUO_FAMILY_SECTION_ID, /\b(solo|duo|famil)/);
    case "formules-midi":
      return formuleSection(menu, (items) => items.every(isFormuleMidiOffer)) ?? null;
    case "promos":
      return bySectionId(PROMO_SECTION_ID, /\bpromo/);
    default:
      // Ancres de section déjà présentes dans la page (#menu-cat-…).
      return menu.categories.find((c) => categoryAnchorId(c) === key) ?? null;
  }
}
